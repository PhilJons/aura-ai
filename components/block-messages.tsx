import { PreviewMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import type { Vote } from '@/lib/db/schema';
import type { ChatRequestOptions, Message } from 'ai';
import { memo } from 'react';
import type { UIBlock } from './block';

interface BlockMessagesProps {
  chatId: string;
  isLoading: boolean;
  votes: Array<Vote> | undefined;
  messages: Array<Message>;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  blockStatus: UIBlock['status'];
}

function PureBlockMessages({
  chatId,
  isLoading,
  votes,
  messages,
  setMessages,
  reload,
  isReadonly,
}: BlockMessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col size-full items-center overflow-y-scroll px-4 pt-4"
    >
      <div className="w-full max-w-[400px] flex flex-col gap-6">
        {messages.map((message, index) => (
          <PreviewMessage
            chatId={chatId}
            key={message.id}
            message={message}
            isLoading={isLoading && index === messages.length - 1}
            vote={
              votes
                ? votes.find((vote) => vote.messageId === message.id)
                : undefined
            }
            setMessages={setMessages}
            reload={reload}
            isReadonly={isReadonly}
          />
        ))}
      </div>

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

export const BlockMessages = memo(PureBlockMessages);
