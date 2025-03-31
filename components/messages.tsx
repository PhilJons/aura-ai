import type { ChangeEvent, FormEvent } from 'react';
import type { ChatRequestOptions, Message } from 'ai';
import { PreviewMessage, ThinkingMessage } from './message';
import { useScrollToBottom } from './use-scroll-to-bottom';
import { Overview } from './overview';
import { memo, useEffect, useMemo, useRef } from 'react';
import type { Vote } from '@/lib/db/schema';
import equal from 'fast-deep-equal';
import { debug } from '@/lib/utils/debug';

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

  // Keep track of previous values for comparison
  const prevStateRef = useRef({
    messageCount: 0,
    isLoading: false,
    isReadonly: false
  });

  // Memoize the message data for debugging to avoid recalculation
  const messageDebugData = useMemo(() => ({
    messageCount: messages.length,
    systemMessageCount: messages.filter(msg => msg.role === 'system').length,
    userMessageCount: messages.filter(msg => msg.role === 'user').length,
    assistantMessageCount: messages.filter(msg => msg.role === 'assistant').length,
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      contentPreview: typeof m.content === 'string' ? m.content.slice(0, 50) : 'non-string content',
      hasToolInvocations: !!m.toolInvocations?.length,
      toolInvocationStates: m.toolInvocations?.map(t => t.state),
      isSystem: m.role === 'system' && typeof m.content === 'string' && m.content.startsWith('Document Intelligence Analysis:')
    })),
    lastMessageRole: messages[messages.length - 1]?.role,
    lastMessageId: messages[messages.length - 1]?.id,
    voteCount: votes.length
  }), [messages, votes]);

  // Use useEffect for debug logging with stable dependencies
  useEffect(() => {
    const currentState = {
      messageCount: messages.length,
      isLoading,
      isReadonly
    };

    // Only log if something changed
    if (!equal(currentState, prevStateRef.current)) {
      debug('message', 'Messages state updated', {
        chatId,
        ...messageDebugData,
        isLoading,
        isReadonly,
        stateChange: {
          from: prevStateRef.current,
          to: currentState
        }
      });
      prevStateRef.current = currentState;
    }
  }, [messageDebugData, isLoading, isReadonly, chatId, messages.length]);

  // Filter out system messages containing document intelligence analysis
  const visibleMessages = useMemo(() => {
    const filtered = messages.filter(msg => 
      !(msg.role === 'system' && 
        typeof msg.content === 'string' && 
        msg.content.startsWith('Document Intelligence Analysis:'))
    );

    if (process.env.NODE_ENV === 'development') {
      debug('message', 'Filtered visible messages', {
        chatId,
        totalMessages: messages.length,
        visibleMessages: filtered.length,
        hiddenSystemMessages: messages.length - filtered.length,
        firstVisibleRole: filtered[0]?.role,
        lastVisibleRole: filtered[filtered.length - 1]?.role
      });
    }

    return filtered;
  }, [messages, chatId]);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Show overview only if there are no messages or only system messages
  const showOverview = useMemo(() => {
    const shouldShow = visibleMessages.length === 0 || 
      (visibleMessages.length === messages.filter(m => m.role === 'system').length);

    if (process.env.NODE_ENV === 'development') {
      debug('message', 'Overview visibility calculated', {
        chatId,
        showOverview: shouldShow,
        visibleMessageCount: visibleMessages.length,
        systemMessageCount: messages.filter(m => m.role === 'system').length,
        isReadonly
      });
    }

    return shouldShow;
  }, [visibleMessages.length, messages, chatId, isReadonly]);

  return (
    <div
      ref={messagesContainerRef}
      className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4"
    >
      {showOverview && <Overview />}

      {visibleMessages.map((message, index) => (
        <PreviewMessage
          key={message.id}
          chatId={chatId}
          message={message}
          isLoading={isLoading && messages.length - 1 === index}
          vote={votes?.find((vote) => vote.messageId === message.id)}
          setMessages={setMessages}
          reload={reload}
          isReadonly={isReadonly}
        />
      ))}

      {isLoading &&
        messages.length > 0 &&
        messages[messages.length - 1].role === 'user' && <ThinkingMessage />}

      <div
        ref={messagesEndRef}
        className="shrink-0 min-w-[24px] min-h-[24px]"
      />
    </div>
  );
}

export const Messages = memo(PureMessages, (prevProps, nextProps) => {
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLoading && nextProps.isLoading) return false;
  
  const prevMessages = prevProps.messages || [];
  const nextMessages = nextProps.messages || [];
  
  if (prevMessages.length !== nextMessages.length) return false;
  if (!equal(prevMessages, nextMessages)) return false;
  if (!equal(prevProps.votes, nextProps.votes)) return false;

  return true;
});
