'use client';

import type { ChatRequestOptions, Message } from 'ai';
import { Button } from './ui/button';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import { Textarea } from './ui/textarea';
import { updateMessage } from '@/app/(chat)/actions';
import { toast } from 'sonner';

interface MessageContent {
  type: string;
  text: string;
}

export type MessageEditorProps = {
  message: Message & { chatId: string };
  setMode: Dispatch<SetStateAction<'view' | 'edit'>>;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
};

export function MessageEditor({
  message,
  setMode,
  setMessages,
  reload,
}: MessageEditorProps) {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [draftContent, setDraftContent] = useState<string>(() => {
    if (typeof message.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return (message.content as MessageContent[])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');
    }
    return String(message.content);
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraftContent(event.target.value);
    adjustHeight();
  };

  const handleSubmit = async () => {
    if (!draftContent.trim()) {
      toast.error('Message cannot be empty');
      return;
    }

    setIsSubmitting(true);

    try {
      // First update the UI optimistically
      setMessages((messages) => {
        const index = messages.findIndex((m) => m.id === message.id);
        if (index !== -1) {
          const updatedMessage = {
            ...message,
            content: draftContent,
            type: 'message' as const
          };
          const updatedMessages = [...messages];
          updatedMessages[index] = updatedMessage;
          // Remove all messages after the edited message
          return updatedMessages.slice(0, index + 1);
        }
        return messages;
      });

      // Update the message in the database
      try {
        await updateMessage({
          id: message.id,
          content: draftContent,
        });

        // Switch back to view mode
        setMode('view');
        
        // Reload the chat to get fresh state
        await reload();
      } catch (error) {
        console.error('Failed to update message:', error);
        throw error; // Re-throw to trigger the error handling below
      }
    } catch (error) {
      console.error('Failed to edit message:', error);
      toast.error('Failed to edit message. Please try again.');
      
      // Revert the optimistic update on error
      setMessages((messages) => {
        const index = messages.findIndex((m) => m.id === message.id);
        if (index !== -1) {
          const updatedMessages = [...messages];
          updatedMessages[index] = message; // Restore original message
          return updatedMessages;
        }
        return messages;
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <Textarea
        ref={textareaRef}
        className="bg-transparent outline-none overflow-hidden resize-none !text-base rounded-xl w-full"
        value={draftContent}
        onChange={handleInput}
      />

      <div className="flex flex-row gap-2 justify-end">
        <Button
          variant="outline"
          className="h-fit py-2 px-3"
          onClick={() => {
            setMode('view');
          }}
        >
          Cancel
        </Button>
        <Button
          variant="default"
          className="h-fit py-2 px-3"
          disabled={isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
