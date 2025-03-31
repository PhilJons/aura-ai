import type { ChangeEvent, FormEvent } from 'react';
import type { ChatRequestOptions, Message, } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Overview } from './overview';
import { memo, useEffect, useMemo, useRef, } from 'react';
import type { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import { debug } from '@/lib/utils/debug';
// GroupedSearchSection is no longer used directly here
// import { GroupedSearchSection } from '@/components/search-section';

interface MessagesProps {
  chatId: string;
  isLoading: boolean;
  votes: Array<Vote> | undefined;
  messages: Array<Message> | undefined;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
  input?: string;
  handleInputChange?: (e: ChangeEvent<HTMLTextAreaElement> | ChangeEvent<HTMLInputElement>) => void;
  handleSubmit?: (e: FormEvent<HTMLFormElement>) => void;
}

// Removed isSearchToolInvocation function as grouping is removed

function PureMessages({
  chatId,
  isLoading,
  votes = [],
  messages = [],
  setMessages,
  reload,
  isReadonly,
  input,
  handleInputChange,
  handleSubmit
}: MessagesProps) {
  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();

  // Keep track of previous values for comparison (optional, for debugging)
  const prevStateRef = useRef({
    messageCount: messages.length,
    isLoading: isLoading,
  });

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const currentCount = messages.length;
      if (prevStateRef.current.messageCount !== currentCount || prevStateRef.current.isLoading !== isLoading) {
         debug('message', 'PureMessages rendering', {
           chatId,
           messageCount: currentCount,
           isLoading,
           lastMessageContentLength: messages[currentCount -1]?.content?.length,
           lastMessageToolInvocations: messages[currentCount -1]?.toolInvocations?.length,
         });
         prevStateRef.current = { messageCount: currentCount, isLoading };
      }
    }
  }, [messages, isLoading, chatId]);

  // Filter out system messages containing document intelligence analysis
  const visibleMessages = useMemo(() => {
    const filtered = messages.filter(msg =>
      !(msg.role === 'system' &&
        typeof msg.content === 'string' &&
        msg.content.startsWith('Document Intelligence Analysis:'))
    );
    return filtered;
  }, [messages]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Show overview only if there are no messages or only system messages
  const showOverview = useMemo(() => {
    return visibleMessages.length === 0 ||
      (visibleMessages.length === messages.filter(m => m.role === 'system').length);
  }, [visibleMessages.length, messages]);

  // --- Single Rendering Logic ---
  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
    >
      {showOverview && <Overview />}

      {/* Use direct rendering for ALL messages */}
      {visibleMessages.map((message, index) => (
        <PreviewMessage
          key={message.id} // Use message ID as key
          chatId={chatId}
          message={message}
          isLoading={isLoading && index === messages.length - 1} // Pass loading state for the last message
          vote={votes?.find((vote) => vote.messageId === message.id)}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {/* Simple Thinking indicator */}
      {isLoading &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' &&
        <ThinkingMessage />}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

// Apply robust memoization using deep equality for messages
export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  // Always re-render if loading state changes
  if (prevProps.isLoading !== nextProps.isLoading) {
      return false; // Needs re-render
  }

  // If message arrays differ deeply, update.
  const prevMessages = prevProps.messages || [];
  const nextMessages = nextProps.messages || [];
  if (!equal(prevMessages, nextMessages)) {
      return false; // Needs re-render for streaming or other changes
  }

  // If votes changed (deep compare).
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false; // Needs re-render
  }

  // If other relevant props change
  if (prevProps.chatId !== nextProps.chatId || prevProps.isReadonly !== nextProps.isReadonly) {
     return false;
  }

  // Otherwise, assume messages are stable and don't re-render
  return true;
});
