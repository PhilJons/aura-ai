import type {
  CoreAssistantMessage,
  CoreToolMessage,
  Message,
  ToolInvocation,
} from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { Message as DBMessage, Document } from '@/lib/db/schema';

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
  return messages.reduce((chatMessages: Array<Message>, message) => {
    // If it's a 'tool' role, handle merging
    if (message.role === 'tool') {
      const toolMessage = message as unknown as CoreToolMessage;
      return addToolMessageToChat({
        toolMessage,
        messages: chatMessages,
      });
    }

    let textContent = '';
    let reasoning: string | undefined = undefined;
    const toolInvocations: Array<ToolInvocation> = [];
    // If the DB has a top-level property 'experimental_attachments', include them
    const experimental_attachments = (message as any).experimental_attachments ?? [];

    if (typeof message.content === 'string') {
      // Just raw text
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      // The message content is an array of objects like {type: 'text', text: ...} or 'tool-call'
      for (const part of message.content) {
        if (part.type === 'text') {
          textContent += part.text;
        } else if (part.type === 'tool-call') {
          toolInvocations.push({
            state: 'call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.args,
          });
        } else if (part.type === 'reasoning') {
          reasoning = part.reasoning;
        }
        // In some AI flows, you may have other chunk types. If so, handle them here.
      }
    } else {
      // If it's an object, or anything else
      // fallback to string
      textContent = JSON.stringify(message.content);
    }

    chatMessages.push({
      id: message.id,
      role: message.role as Message['role'],
      content: textContent,
      reasoning,
      toolInvocations,
      experimental_attachments,
    });

    return chatMessages;
  }, []);
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
  const messagesBySanitizedToolInvocations = messages.map((message) => {
    if (message.role !== 'assistant') return message;
    if (!message.toolInvocations) return message;

    const toolResultIds: Array<string> = [];
    for (const toolInvocation of message.toolInvocations) {
      if (toolInvocation.state === 'result') {
        toolResultIds.push(toolInvocation.toolCallId);
      }
    }

    const sanitizedToolInvocations = message.toolInvocations.filter(
      (toolInvocation) =>
        toolInvocation.state === 'result' ||
        toolResultIds.includes(toolInvocation.toolCallId),
    );

    return {
      ...message,
      toolInvocations: sanitizedToolInvocations,
    };
  });

  return messagesBySanitizedToolInvocations.filter(
    (message) =>
      message.content.length > 0 ||
      (message.toolInvocations && message.toolInvocations.length > 0) ||
      (message.experimental_attachments && message.experimental_attachments.length > 0),
  );
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