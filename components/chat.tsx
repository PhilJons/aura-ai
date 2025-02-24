'use client';

import type { Attachment, Message, ChatRequestOptions } from 'ai';
import { useChat } from 'ai/react';
import { useState, useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useRouter } from 'next/navigation';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';
import { markFileUploadStarted, markFileUploadComplete } from '@/lib/utils/stream';

import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { toast } from 'sonner';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
  isReadonly,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const { mutate } = useSWRConfig();
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const router = useRouter();

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
    body: { id, selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    headers: {
      'x-visibility-type': selectedVisibilityType
    },
    onFinish: () => {
      mutate('/api/history');
      
      if (attachments.length > 0) {
        // Start processing
        markFileUploadStarted(id);
        
        const eventSource = new EventSource(`/api/chat/stream?chatId=${id}`);
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'document-context-update-complete') {
            // Processing done
            markFileUploadComplete(id);
            eventSource.close();
          }
        };

        // Fallback timeout
        setTimeout(() => {
          markFileUploadComplete(id);
          eventSource.close();
        }, 10000);
      }
    },
    onError: (error) => {
      if (error.message && !error.message.includes('message channel closed')) {
        toast.error('An error occurred, please try again!');
      }
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const handleSubmit = useCallback(async (
    event?: { preventDefault?: () => void } | undefined,
    chatRequestOptions?: ChatRequestOptions | undefined
  ) => {
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
        console.error("Error sending message:", err);
        toast.error("Failed to send message. Please try again.");
        markFileUploadComplete(id);
      }
    } else {
      try {
        await originalHandleSubmit(event, chatRequestOptions);
      } catch (err) {
        console.error("Error sending message:", err);
        toast.error("Failed to send message. Please try again.");
      }
    }
  }, [attachments, input, isLoading, originalHandleSubmit, id]);

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader
        chatId={id}
        selectedModelId={selectedChatModel}
        selectedVisibilityType={selectedVisibilityType}
        isReadonly={isReadonly}
        isLoading={isLoading}
        isProcessingFile={isProcessingFile}
      />

      <Messages
        chatId={id}
        isLoading={isLoading}
        votes={votes}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        isReadonly={isReadonly}
      />

      <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        {!isReadonly && (
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
            selectedChatModel={selectedChatModel}
            setIsProcessingFile={setIsProcessingFile}
          />
        )}
      </form>
    </div>
  );
}
