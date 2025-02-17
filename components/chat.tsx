'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from 'ai/react';
import { useState, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { debug } from '@/lib/utils/debug';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';

import { Block } from './block';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useBlockSelector } from '@/hooks/use-block';
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

  debug('message', 'Chat initialization source', {
    chatId: id,
    isNewChat: initialMessages.length === 0,
    initialMessageCount: initialMessages.length,
    hasDocuments: initialMessages.some(msg => 
      msg.content.includes('"kind":') && 
      (msg.content.includes('"text"') || 
       msg.content.includes('"code"') || 
       msg.content.includes('"image"') || 
       msg.content.includes('"sheet"'))
    ),
    isPageReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
  });

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages: initialMessages.map(msg => {
      debug('message', 'Raw initial message', {
        messageId: msg.id,
        role: msg.role,
        content: msg.content,
        hasToolInvocations: !!msg.toolInvocations?.length,
        toolInvocations: msg.toolInvocations
      });

      let parsedContent: any;
      try {
        parsedContent = Array.isArray(msg.content) ? msg.content[0] : JSON.parse(msg.content);
        debug('message', 'Parsed initial message content', {
          messageId: msg.id,
          role: msg.role,
          contentType: parsedContent.type,
          hasToolCall: parsedContent.type === 'tool-call',
          hasToolResult: parsedContent.type === 'tool-result',
          toolName: parsedContent.toolName,
          documentId: parsedContent.type === 'document' ? parsedContent.result?.id : undefined
        });
      } catch (error) {
        debug('message', 'Initial message is plain text', {
          messageId: msg.id,
          role: msg.role,
          contentPreview: `${msg.content.substring(0, 100)}...`
        });
      }
      return { ...msg, chatId: id };
    }),
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: () => {
      debug('message', 'Chat finished processing', {
        chatId: id,
        finalMessageCount: messages.length + 1
      });
      mutate('/api/history');
    },
    onError: (error) => {
      debug('message', 'Chat error occurred', {
        chatId: id,
        error: error.message
      });
      if (error.message && !error.message.includes('message channel closed')) {
        toast.error('An error occurred, please try again!');
      }
    },
  });

  const messagesWithChatId = messages.map(msg => ({ ...msg, chatId: id }));

  useEffect(() => {
    debug('message', 'Messages updated', {
      chatId: id,
      messageCount: messages.length,
      hasDocuments: messages.some(msg => {
        try {
          const content = JSON.parse(msg.content);
          return content.type === 'document' || 
                 (content.type === 'tool-call' && content.toolName === 'createDocument') ||
                 (content.type === 'tool-result' && content.toolName === 'createDocument');
        } catch {
          return false;
        }
      }),
      messageTypes: messages.map(msg => {
        try {
          const content = JSON.parse(msg.content);
          return `${msg.role}:${content.type}`;
        } catch {
          return `${msg.role}:text`;
        }
      })
    });
  }, [messages, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isBlockVisible = useBlockSelector((state) => state.isVisible);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedChatModel}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={isReadonly}
        />

        <Messages
          chatId={id}
          isLoading={isLoading}
          votes={votes}
          messages={messagesWithChatId}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
          isBlockVisible={isBlockVisible}
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
              messages={messagesWithChatId}
              setMessages={setMessages}
              append={append}
              selectedChatModel={selectedChatModel}
            />
          )}
        </form>
      </div>

      <Block
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messagesWithChatId}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
        selectedChatModel={selectedChatModel}
      />
    </>
  );
}
