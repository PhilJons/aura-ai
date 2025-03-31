'use client';

import type { Attachment, Message, ChatRequestOptions } from 'ai';
import { useChat } from 'ai/react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useSearchToggle } from '@/components/search-toggle';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { markFileUploadStarted, markFileUploadComplete } from '@/lib/utils/stream';
import { debug } from '@/lib/utils/debug';
import { trackNewChatStarted } from '@/lib/client-analytics';

import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { toast } from 'sonner';

export function Chat({
  id,
  initialMessages = [],
  selectedChatModel = 'chat-model-small',
  selectedVisibilityType = 'private',
  isReadonly = false,
}: {
  id: string;
  initialMessages?: Array<Message>;
  selectedChatModel?: string;
  selectedVisibilityType?: VisibilityType;
  isReadonly?: boolean;
}) {
  const { mutate } = useSWRConfig();
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isExistingChat, setIsExistingChat] = useState(false);
  const [currentModel, setCurrentModel] = useState(selectedChatModel);
  const router = useRouter();
  const { data: session } = useSession();
  const userEmail = session?.user?.email;
  const { isSearchEnabled } = useSearchToggle();

  // Add debug logging for search toggle
  useEffect(() => {
    console.log(`[Search Toggle] Search is ${isSearchEnabled ? 'enabled' : 'disabled'}`);
  }, [isSearchEnabled]);

  // Track new chat started
  useEffect(() => {
    // Only track if this is a new chat (no initial messages)
    if (initialMessages.length === 0) {
      trackNewChatStarted(userEmail || undefined);
    }
  }, [initialMessages.length, userEmail]);

  // Fetch chat data
  const { data: chat, error: chatError } = useSWR(
    `/api/chat?id=${id}`,
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 10000,
      shouldRetryOnError: false
    }
  );

  // Update currentModel when chat data changes
  useEffect(() => {
    if (chat?.model) {
      setCurrentModel(chat.model);
    }
  }, [chat]);

  // Fetch messages if not provided
  const { data: fetchedMessages } = useSWR(
    initialMessages.length === 0 ? `/api/chat/message?chatId=${id}&includeSystem=true` : null,
    fetcher,
    { fallbackData: [], revalidateOnFocus: true }
  );

  // Fetch votes
  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  // Determine if the chat is readonly based on ownership
  const actualReadonly = chat 
    ? chat.userId !== session?.user?.id || isReadonly
    : isReadonly;

  // Handle 404 if chat doesn't exist or user doesn't have access
  useEffect(() => {
    if (chatError?.status === 404 || (chat && chat.visibility === "private" && chat.userId !== session?.user?.id)) {
      debug('chat', 'Access denied or chat not found', {
        chatId: id,
        errorStatus: chatError?.status,
        visibility: chat?.visibility,
        chatUserId: chat?.userId,
        sessionUserId: session?.user?.id,
        isOwner: chat?.userId === session?.user?.id
      });
      router.push('/not-found');
    }
  }, [chat, chatError, id, router, session?.user?.id]);

  // Use fetched messages or provided initialMessages
  const messagesToUse = useMemo(() => {
    return initialMessages.length > 0 ? initialMessages : (fetchedMessages || []);
  }, [initialMessages, fetchedMessages]);

  // Determine if this is an existing chat with history
  useEffect(() => {
    // Check if the chat exists in the database
    if (chat) {
      setIsExistingChat(true);
      return;
    }
    
    // Check if there are any non-system messages
    const messagesToCheck = initialMessages.length > 0 ? initialMessages : (fetchedMessages || []);
    const hasUserMessages = messagesToCheck.some((msg: Message) => msg.role === 'user' || msg.role === 'assistant');
    setIsExistingChat(hasUserMessages);
  }, [chat, initialMessages, fetchedMessages]);

  debug('chat', 'Chat component mounted', {
    id,
    hasInitialMessages: messagesToUse.length > 0,
    selectedChatModel: chat?.model || selectedChatModel,
    selectedVisibilityType: chat?.visibility || selectedVisibilityType,
    isReadonly: actualReadonly
  });

  const {
    messages,
    setMessages,
    handleSubmit: originalHandleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: { id, selectedChatModel: currentModel },
    initialMessages: messagesToUse,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    api: actualReadonly ? undefined : '/api/chat', // Disable API if readonly
    headers: {
      'x-visibility-type': chat?.visibility || selectedVisibilityType,
      'x-search-enabled': isSearchEnabled.toString()
    },
    onFinish: () => {
      debug('chat', 'Chat message finished', {
        id,
        messageCount: messages.length,
        hasAttachments: attachments.length > 0
      });

      // Ensure we have the latest messages
      mutate('/api/history');
      
      // CRITICAL: After streaming completes, don't do any state changes that might
      // cause messages to disappear or a rehydration mode switch
      
      if (attachments.length > 0) {
        // Start processing
        markFileUploadStarted(id);
        
        const eventSource = new EventSource(`/api/chat/stream?chatId=${id}`);
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          debug('chat', 'SSE message received', {
            id,
            eventType: data.type
          });

          if (data.type === 'document-context-update-complete') {
            // Processing done
            markFileUploadComplete(id);
            eventSource.close();
          }
        };

        // Fallback timeout
        setTimeout(() => {
          debug('chat', 'SSE connection timeout', { id });
          markFileUploadComplete(id);
          eventSource.close();
        }, 10000);
      }
    },
    onError: (error) => {
      debug('chat', 'Chat error occurred', {
        id,
        error: error.message
      });

      if (error.message && !error.message.includes('message channel closed')) {
        toast.error('An error occurred, please try again!');
      }
    },
  });

  // Monitor for search tool invocations and ensure they're properly rendered
  useEffect(() => {
    if (isLoading && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'assistant') {
        // Track if we have search tool invocations
        const hasSearchToolInvocations = lastMessage?.toolInvocations?.some(inv => 
          inv && (
            inv.toolName === 'search' || 
            (typeof inv.toolName === 'string' && inv.toolName.includes('search'))
          )
        );
        
        if (hasSearchToolInvocations) {
          debug('chat', 'Search tool invocation detected in streaming message', {
            id,
            messageId: lastMessage.id,
            toolCount: lastMessage.toolInvocations?.length
          });
          
          // Set up polling to ensure search results update during streaming
          const intervalId = setInterval(() => {
            // Creating a new array reference is necessary to trigger a re-render
            const updatedMessages = [...messages];
            setMessages(updatedMessages);
          }, 200);
          
          return () => clearInterval(intervalId);
        }
      }
    }
  }, [id, messages, isLoading, setMessages]);

  useEffect(() => {
    debug('chat', 'Chat state updated', {
      id,
      messageCount: messages.length,
      isLoading,
      isReadonly: actualReadonly,
      isProcessingFile,
      input: input ? 'has input' : 'no input'
    });
  }, [id, messages.length, isLoading, actualReadonly, isProcessingFile, input]);

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const handleSubmit = useCallback(async (
    event?: { preventDefault?: () => void } | undefined,
    chatRequestOptions?: ChatRequestOptions | undefined
  ) => {
    debug('chat', 'Handling submit', {
      id,
      hasInput: !!input.trim(),
      isLoading,
      attachmentCount: attachments.length,
      isReadonly: actualReadonly
    });

    if (!input.trim() || isLoading) return;

    if (attachments.length > 0) {
      setIsProcessingFile(true);
      
      // Start processing
      markFileUploadStarted(id);
      
      // Wait a moment for SSE connection to establish
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        await originalHandleSubmit(event, {
          ...chatRequestOptions,
          body: {
            ...chatRequestOptions?.body,
            attachments,
          },
        });
        setAttachments([]);
      } catch (err) {
        debug('chat', 'Error sending message with attachments', {
          id,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
        console.error("Error sending message:", err);
        toast.error("Failed to send message. Please try again.");
        markFileUploadComplete(id);
      }
    } else {
      try {
        await originalHandleSubmit(event, chatRequestOptions);
      } catch (err) {
        debug('chat', 'Error sending message', {
          id,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
        console.error("Error sending message:", err);
        toast.error("Failed to send message. Please try again.");
      }
    }
  }, [attachments, input, isLoading, originalHandleSubmit, id, actualReadonly]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        console.log('[Chat Component] Last message updated:', {
          id: lastMessage.id,
          role: lastMessage.role,
          content: lastMessage.content, // Log the raw content
          contentLength: typeof lastMessage.content === 'string' ? lastMessage.content.length : 'N/A',
          toolInvocations: lastMessage.toolInvocations
        });
      }
      // Optional: Log the entire messages array for detailed inspection (can be verbose)
      // console.log('[Chat Component] Full messages array:', JSON.stringify(messages));
    }
  }, [messages]); // Log whenever the messages array changes

  // Add a cookie listener to detect model changes
  useEffect(() => {
    // Function to handle cookie changes
    const handleCookieChange = () => {
      // Force a revalidation of the chat data
      mutate(`/api/chat?id=${id}`);
    };

    // Set up event listener for cookie changes
    window.addEventListener('cookie-change', handleCookieChange);
    
    return () => {
      window.removeEventListener('cookie-change', handleCookieChange);
    };
  }, [id, mutate]);

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader
        chatId={id}
        selectedModelId={currentModel}
        selectedVisibilityType={chat?.visibility || selectedVisibilityType}
        isReadonly={actualReadonly}
        isLoading={isLoading}
        isProcessingFile={isProcessingFile}
        onModelChange={setCurrentModel}
      />

      <Messages
        chatId={id}
        isLoading={isLoading}
        votes={votes}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        isReadonly={actualReadonly}
        input={input}
        handleInputChange={(e) => setInput(e.target.value)}
        handleSubmit={handleSubmit}
      />

      <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        {!actualReadonly && (
          <MultimodalInput
            chatId={id}
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            setMessages={setMessages}
            append={append}
            selectedChatModel={chat?.model || selectedChatModel}
            setIsProcessingFile={setIsProcessingFile}
            isExistingChat={isExistingChat}
          />
        )}
      </form>
    </div>
  );
}
