'use client';

import type { ChatRequestOptions, Message as AIMessage } from 'ai';
import { Button } from './ui/button';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import { Textarea } from './ui/textarea';
import { deleteTrailingMessages } from '@/app/(chat)/actions';
import { toast } from 'sonner';
import type { Message, } from '@/lib/db/schema';

export type MessageEditorProps = {
  message: AIMessage & { chatId?: string };
  setMode: Dispatch<SetStateAction<'view' | 'edit'>>;
  setMessages: (
    messages: AIMessage[] | ((messages: AIMessage[]) => AIMessage[]),
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
  const [draftContent, setDraftContent] = useState<string>(message.content);
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
    try {
      setIsSubmitting(true);

      // Log the incoming message for debugging
      console.log('Starting message edit:', {
        messageId: message.id,
        chatId: message.chatId,
        content: message.content,
        role: message.role
      });

      // Ensure we have a chatId
      if (!message.chatId) {
        throw new Error('Message has no chatId - cannot edit message');
      }

      // First save the edited message to the database
      let savedMessage: Message;
      const response = await fetch('/api/chat/message', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: message.id,
          chatId: message.chatId,
          role: message.role,
          content: draftContent,
          createdAt: new Date().toISOString(),
          type: 'message'
        }),
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        console.error('Server response error:', {
          status: response.status,
          statusText: response.statusText,
          body: responseText
        });
        throw new Error(responseText || `Failed to save message: ${response.status}`);
      }

      try {
        savedMessage = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse server response:', responseText);
        throw new Error('Invalid server response');
      }

      console.log('Successfully saved message:', {
        messageId: savedMessage.id,
        chatId: savedMessage.chatId,
        content: savedMessage.content,
        role: savedMessage.role,
        type: savedMessage.type
      });

      try {
        // Then delete trailing messages
        await deleteTrailingMessages({
          id: message.id,
        });
        console.log('Successfully deleted trailing messages');
      } catch (deleteError) {
        console.error('Error deleting trailing messages:', deleteError);
        // Don't throw here - we still want to update the UI with the saved message
        toast.error('Failed to delete trailing messages');
      }

      // Update UI state with the saved message
      setMessages((messages) => {
        const index = messages.findIndex((m) => m.id === message.id);
        if (index !== -1) {
          // Convert the saved Cosmos DB message back to an AI message format
          const aiMessage: AIMessage & { chatId?: string } = {
            id: savedMessage.id,
            content: savedMessage.content,
            role: savedMessage.role === 'tool' ? 'assistant' : savedMessage.role,
            chatId: savedMessage.chatId,
            createdAt: new Date(savedMessage.createdAt)
          };
          console.log('Converted to AI message format:', aiMessage);
          return [...messages.slice(0, index), aiMessage];
        }
        return messages;
      });

      setMode('view');
      reload();
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update message');
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
