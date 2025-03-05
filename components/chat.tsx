'use client';

import type { Attachment, Message, ChatRequestOptions } from 'ai';
import { useChat } from 'ai/react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { markFileUploadStarted, markFileUploadComplete } from '@/lib/utils/stream';
import { debug } from '@/lib/utils/debug';

import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { toast } from 'sonner';
import { usePersistentAttachments } from '@/lib/hooks/use-persistent-attachments';
import { PersistentAttachments } from './persistent-attachments';
import { ModelSelector } from '@/components/model-selector';
import { VisibilitySelector } from '@/components/visibility-selector';

// Map URL parameter values to internal model IDs
const URL_MODEL_MAP: Record<string, string> = {
  'gpt-4o': 'chat-model-large',
  'gpt-4o-mini': 'chat-model-small'
};

// Reverse mapping for internal model IDs to URL parameter values
const INTERNAL_MODEL_MAP: Record<string, string> = {
  'chat-model-large': 'gpt-4o',
  'chat-model-small': 'gpt-4o-mini'
};

// Default model if no parameter is present
const DEFAULT_MODEL = 'chat-model-small';

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
  const router = useRouter();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  
  // Get model from URL parameter
  const urlModel = searchParams.get('model');
  
  // Use persistent attachments hook
  const { 
    persistentAttachments, 
    addPersistentAttachments,
    clearPersistentAttachments
  } = usePersistentAttachments(id);

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
  
  // Determine effective model based on URL parameter, chat data, and props
  const effectiveModel = useMemo(() => {
    // For existing chats with messages, prioritize the chat's stored model
    if (isExistingChat && chat?.model) {
      return chat.model;
    }
    
    // For new chats or chats without a stored model, use URL parameter
    if (urlModel && URL_MODEL_MAP[urlModel]) {
      return URL_MODEL_MAP[urlModel];
    }
    
    // Fallback to props or default
    return selectedChatModel || DEFAULT_MODEL;
  }, [urlModel, chat?.model, selectedChatModel, isExistingChat]);

  // Log model selection for debugging
  useEffect(() => {
    console.log("Chat - model selection:", {
      urlModel,
      chatModel: chat?.model,
      selectedChatModel,
      effectiveModel,
      isExistingChat
    });
  }, [urlModel, chat?.model, selectedChatModel, effectiveModel, isExistingChat]);

  // Fetch messages if not provided
  const { data: fetchedMessages } = useSWR(
    initialMessages.length === 0 ? `/api/chat/message?chatId=${id}&includeSystem=true` : null,
    fetcher,
    { fallbackData: [], revalidateOnFocus: true }
  );

  // Fetch votes
  const { data: votes } = useSWR(
    `/api/chat/vote?chatId=${id}`,
    fetcher,
    { fallbackData: [], revalidateOnFocus: true }
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
    selectedChatModel: effectiveModel,
    selectedVisibilityType: chat?.visibility || selectedVisibilityType,
    isReadonly: actualReadonly
  });

  // Determine the API URL with model parameter
  const apiUrl = useMemo(() => {
    // Always include the model parameter in the API URL
    const modelParam = urlModel || (INTERNAL_MODEL_MAP[effectiveModel] || 'gpt-4o-mini');
    console.log("Chat - API URL model parameter:", modelParam, "from effectiveModel:", effectiveModel);
    return `/api/chat?model=${modelParam}`;
  }, [urlModel, effectiveModel]);

  // Ensure the URL includes the model parameter
  useEffect(() => {
    if (!isExistingChat && typeof window !== 'undefined') {
      const INTERNAL_MODEL_MAP: Record<string, string> = {
        'chat-model-large': 'gpt-4o',
        'chat-model-small': 'gpt-4o-mini'
      };
      
      const currentUrl = new URL(window.location.href);
      const expectedModelParam = INTERNAL_MODEL_MAP[effectiveModel] || 'gpt-4o-mini';
      const currentModelParam = currentUrl.searchParams.get('model');
      
      if (currentModelParam !== expectedModelParam) {
        console.log("Chat - Updating URL model parameter:", {
          from: currentModelParam,
          to: expectedModelParam
        });
        
        currentUrl.searchParams.set('model', expectedModelParam);
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }
  }, [effectiveModel, isExistingChat]);

  // Set up chat hooks
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
    body: { 
      id, 
      selectedChatModel: effectiveModel,
      modelParam: urlModel || (INTERNAL_MODEL_MAP[effectiveModel] || 'gpt-4o-mini')
    },
    initialMessages: messagesToUse,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    api: actualReadonly ? undefined : apiUrl,
    headers: {
      'x-visibility-type': chat?.visibility || selectedVisibilityType
    },
    onResponse: (response) => {
      // If this is a new chat, update the URL with the chat ID while preserving the model parameter
      if (!isExistingChat) {
        setIsExistingChat(true);
        
        // Get the chat ID from the response URL
        const responseUrl = response.url;
        const match = responseUrl.match(/\/chat\/([^\/\?]+)/);
        if (match && match[1]) {
          const newChatId = match[1];
          
          // Get the current model parameter
          const INTERNAL_MODEL_MAP: Record<string, string> = {
            'chat-model-large': 'gpt-4o',
            'chat-model-small': 'gpt-4o-mini'
          };
          
          // If we have a URL parameter, use it directly
          // Otherwise, map the effective model to a URL parameter
          const modelParam = urlModel || INTERNAL_MODEL_MAP[effectiveModel] || 'gpt-4o-mini';
          
          // For debugging, log what model we're actually using
          console.log("Chat - onResponse - Model selection:", {
            urlModel,
            effectiveModel,
            mappedModel: INTERNAL_MODEL_MAP[effectiveModel],
            finalModelParam: modelParam
          });
          
          // Preserve the model parameter when redirecting to the new chat
          const modelQueryParam = `?model=${modelParam}`;
          
          console.log("Chat - onResponse - Updating URL:", {
            newChatId,
            modelParam,
            fullUrl: `/chat/${newChatId}${modelQueryParam}`
          });
          
          // Use window.history to update the URL without causing a full page reload
          if (typeof window !== 'undefined') {
            window.history.replaceState(
              {}, 
              '', 
              `/chat/${newChatId}${modelQueryParam}`
            );
            
            // Also update the router to ensure Next.js internal state is updated
            router.replace(`/chat/${newChatId}${modelQueryParam}`, { scroll: false });
          }
        }
      }
    },
    onFinish: () => {
      debug('chat', 'Chat message finished', {
        id,
        messageCount: messages.length,
        hasAttachments: attachments.length > 0
      });

      mutate('/api/history');
      
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
    console.log('Chat - handleSubmit - Starting submission', {
      id,
      hasInput: !!input.trim(),
      isLoading,
      attachmentCount: attachments.length,
      persistentAttachmentCount: persistentAttachments.length,
      isReadonly: actualReadonly,
      chatRequestOptions,
      effectiveModel,
      urlModel
    });

    if (!input.trim() || isLoading) return;

    // Add any new attachments to the persistent list if they are images
    const imageAttachments = attachments.filter(a => a.contentType?.startsWith('image/'));
    console.log('Chat - handleSubmit - Image attachments to add to persistent:', {
      count: imageAttachments.length,
      attachments: imageAttachments.map(a => ({
        name: a.name,
        contentType: a.contentType,
        url: a.url?.substring(0, 30) + '...'
      }))
    });
    
    if (imageAttachments.length > 0) {
      addPersistentAttachments(imageAttachments);
      console.log('Chat - handleSubmit - Added images to persistent attachments, new count:', persistentAttachments.length + imageAttachments.length);
    }

    // Combine current attachments with persistent attachments
    const allAttachments = [
      ...attachments,
      // Only include persistent attachments that aren't already in the current attachments
      ...persistentAttachments.filter(pa => 
        !attachments.some(a => a.url === pa.url)
      )
    ];
    
    console.log('Chat - handleSubmit - All attachments to send:', {
      count: allAttachments.length,
      attachments: allAttachments.map(a => ({
        name: a.name,
        contentType: a.contentType,
        url: a.url?.substring(0, 30) + '...'
      }))
    });

    // Get the current model parameter for the API request
    const INTERNAL_MODEL_MAP: Record<string, string> = {
      'chat-model-large': 'gpt-4o',
      'chat-model-small': 'gpt-4o-mini'
    };
    const modelParam = urlModel || INTERNAL_MODEL_MAP[effectiveModel] || 'gpt-4o-mini';
    console.log('Chat - handleSubmit - Using model parameter:', modelParam);

    if (allAttachments.length > 0) {
      setIsProcessingFile(true);
      
      // Start processing
      markFileUploadStarted(id);
      
      // Wait a moment for SSE connection to establish
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        console.log('Chat - handleSubmit - Sending message with attachments', {
          attachmentsCount: allAttachments.length,
          persistentAttachmentsCount: persistentAttachments.length,
          persistentAttachmentDetails: persistentAttachments.map(a => ({
            name: a.name,
            contentType: a.contentType,
            url: a.url?.substring(0, 30) + '...'
          })),
          modelParam
        });
        
        await originalHandleSubmit(event, {
          ...chatRequestOptions,
          body: {
            ...chatRequestOptions?.body,
            attachments: allAttachments,
            persistentAttachments: persistentAttachments,
            selectedChatModel: effectiveModel,
            modelParam
          },
        });
        // Only clear temporary attachments, not persistent ones
        setAttachments([]);
        console.log('Chat - handleSubmit - Message with attachments sent successfully');
      } catch (err) {
        console.error("Chat - handleSubmit - Error sending message with attachments:", err);
        toast.error("Failed to send message. Please try again.");
        markFileUploadComplete(id);
      }
    } else {
      try {
        console.log('Chat - handleSubmit - Sending message without attachments but with persistent attachments', {
          persistentAttachmentsCount: persistentAttachments.length,
          persistentAttachmentDetails: persistentAttachments.map(a => ({
            name: a.name,
            contentType: a.contentType,
            url: a.url?.substring(0, 30) + '...'
          })),
          modelParam
        });
        
        await originalHandleSubmit(event, {
          ...chatRequestOptions,
          body: {
            ...chatRequestOptions?.body,
            persistentAttachments: persistentAttachments,
            selectedChatModel: effectiveModel,
            modelParam
          },
        });
        console.log('Chat - handleSubmit - Message without attachments sent successfully');
      } catch (err) {
        console.error("Chat - handleSubmit - Error sending message:", err);
        toast.error("Failed to send message. Please try again.");
      }
    }
  }, [attachments, persistentAttachments, input, isLoading, originalHandleSubmit, id, actualReadonly, addPersistentAttachments, effectiveModel, urlModel]);

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-3.5rem)] overflow-hidden">
      <ChatHeader
        chatId={id}
        selectedModelId={effectiveModel}
        selectedVisibilityType={chat?.visibility || selectedVisibilityType}
        isReadonly={actualReadonly}
        isLoading={isLoading}
        isProcessingFile={isProcessingFile}
        hasMessages={messages.some((msg: Message) => msg.role === 'user' || msg.role === 'assistant')}
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

      <form className="flex flex-col mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        {!actualReadonly && (
          <>
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
          </>
        )}
      </form>
    </div>
  );
}
