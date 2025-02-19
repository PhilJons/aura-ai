import type {
  CoreAssistantMessage,
  CoreToolMessage,
  Message as BaseMessage,
  ToolInvocation,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { Message as DBMessage, Document } from '@/lib/db/schema';

// Extend the base Message type with our additional properties
interface Message extends BaseMessage {
  messageIndex?: number;
  totalMessages?: number;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      'An error occurred while fetching the data.',
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== 'undefined') {
    return JSON.parse(localStorage.getItem(key) || '[]');
  }
  return [];
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * If a message is a "tool" role, merges in the tool result into the existing conversation.
 * For normal messages, returns them as text.
 * This function was originally ignoring attachments; we now add them.
 */
function addToolMessageToChat({
  toolMessage,
  messages,
}: {
  toolMessage: CoreToolMessage;
  messages: Array<Message>;
}): Array<Message> {
  return messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: message.toolInvocations.map((toolInvocation) => {
          const toolResult = toolMessage.content.find(
            (tool) => tool.toolCallId === toolInvocation.toolCallId,
          );
          if (toolResult) {
            return {
              ...toolInvocation,
              state: 'result',
              result: toolResult.result,
            };
          }
          return toolInvocation;
        }),
      };
    }
    return message;
  });
}

/**
 * Converts Cosmos DB messages into UI messages for the chat interface.
 * Now includes experimental_attachments so attachments persist across reload.
 */
export function convertToUIMessages(messages: Array<DBMessage>): Array<Message> {
  console.log('[convertToUIMessages] Input messages:', messages.map(m => ({
    id: m.id.slice(0,8),
    role: m.role,
    content: Array.isArray(m.content) 
      ? m.content.map(c => c.type) 
      : typeof m.content
  })));

  // First pass: Process all non-tool messages
  const initialMessages = messages.reduce((acc: Array<Message>, message) => {
    if (message.role === 'tool') return acc;

    let textContent = '';
    let reasoning: string | undefined = undefined;
    const toolInvocations: Array<ToolInvocation> = [];
    const experimental_attachments = (message as any).experimental_attachments ?? [];

    if (typeof message.content === 'string') {
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === 'text') {
          textContent += content.text;
        } else if (content.type === 'tool-call') {
          toolInvocations.push({
            state: 'call',
            toolCallId: content.toolCallId,
            toolName: content.toolName,
            args: content.args,
          });
        } else if (content.type === 'tool-result') {
          toolInvocations.push({
            state: 'result',
            toolCallId: content.toolCallId,
            toolName: content.toolName,
            result: content.result,
            args: {},
          });
        } else if (content.type === 'reasoning') {
          reasoning = content.reasoning;
        }
      }
    }

    acc.push({
      id: message.id,
      role: message.role as Message['role'],
      content: textContent,
      reasoning,
      toolInvocations,
      experimental_attachments,
    });

    return acc;
  }, []);

  // Second pass: Process tool messages and update related messages
  const finalMessages = messages.reduce((acc: Array<Message>, message) => {
    if (message.role !== 'tool') return acc;

    return addToolMessageToChat({
      toolMessage: message as CoreToolMessage,
      messages: acc,
    });
  }, initialMessages);

  console.log('[convertToUIMessages] Final messages:', finalMessages.map(m => ({
    id: m.id.slice(0,8),
    role: m.role,
    hasContent: m.content.length > 0,
    hasToolInvocations: m.toolInvocations?.length || 0
  })));

  return finalMessages;
}

/**
 * Removes any tool calls that were incomplete, etc.
 */
export function sanitizeResponseMessages({
  messages,
  reasoning,
}: {
  messages: Array<CoreAssistantMessage | CoreToolMessage>;
  reasoning: string | undefined;
}) {
  const toolResultIds: Array<string> = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      for (const content of message.content) {
        if (content.type === 'tool-result') {
          toolResultIds.push(content.toolCallId);
        }
      }
    }
  }

  const messagesBySanitizedContent = messages.map((message) => {
    if (message.role !== 'assistant') return message;
    if (typeof message.content === 'string') return message;

    const sanitizedContent = message.content.filter((content) =>
      content.type === 'tool-call'
        ? toolResultIds.includes(content.toolCallId)
        : content.type === 'text'
        ? content.text.length > 0
        : true,
    );

    if (reasoning) {
      // Add reasoning chunk if present
      sanitizedContent.push({ type: 'reasoning', reasoning } as any);
    }

    return {
      ...message,
      content: sanitizedContent,
    };
  });

  return messagesBySanitizedContent.filter(
    (message) => message.content.length > 0,
  );
}

/**
 * Remove incomplete or empty tool calls from UI messages
 */
export function sanitizeUIMessages(messages: Array<Message>): Array<Message> {
  // First collect all tool result IDs
  const toolResultIds: Array<string> = [];
  messages.forEach((message) => {
    if (message.toolInvocations) {
      message.toolInvocations.forEach((toolInvocation) => {
        if (toolInvocation.state === 'result') {
          toolResultIds.push(toolInvocation.toolCallId);
        }
      });
    }
  });

  // Then process each message
  const messagesBySanitizedToolInvocations = messages.map((message) => {
    // Don't modify user messages
    if (message.role === 'user') return message;

    // For assistant messages with tool invocations
    if (message.role === 'assistant' && message.toolInvocations?.length) {
      const sanitizedToolInvocations = message.toolInvocations.filter(
        (toolInvocation) =>
          toolInvocation.state === 'result' ||
          toolResultIds.includes(toolInvocation.toolCallId)
      );

      return {
        ...message,
        toolInvocations: sanitizedToolInvocations,
      };
    }

    // For all other messages, return as is
    return message;
  });

  // Filter out messages that have no content AND no valid tool invocations
  return messagesBySanitizedToolInvocations.filter((message) => {
    // Keep messages with non-empty content
    if (message.content && message.content.length > 0) return true;

    // Keep messages with valid tool invocations
    if (message.toolInvocations && message.toolInvocations.length > 0) return true;

    // Keep messages with attachments
    if (message.experimental_attachments && message.experimental_attachments.length > 0) return true;

    // Filter out empty messages
    return false;
  });
}

export function getMostRecentUserMessage(messages: Array<Message>) {
  const userMessages = messages.filter((message) => message.role === 'user');
  return userMessages.at(-1);
}

export function getDocumentTimestampByIndex(
  documents: Array<Document>,
  index: number,
) {
  if (!documents) return new Date();
  if (index > documents.length) return new Date();
  return documents[index].createdAt;
}