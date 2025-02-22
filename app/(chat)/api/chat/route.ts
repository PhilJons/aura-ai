import {
  type Message as AIMessage,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import type { Message as DBMessage } from '@/lib/db/schema';
import { containers } from '@/lib/db/cosmos';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
  convertToUIMessages,
} from '@/lib/utils';
import { emitDocumentContextUpdate } from '@/lib/utils/stream';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { getEncoding } from 'js-tiktoken';

// Maximum tokens we want to allow for the context (8k for GPT-4)
const MAX_CONTEXT_TOKENS = 8000;
// Reserve tokens for the response and other messages
const RESERVE_TOKENS = 1000;
// Maximum tokens we want to allow for a single document
const MAX_DOC_TOKENS = 2000;

// Azure OpenAI rate limit handling
const azureRateLimit = {
  tokens: 100,
  lastRefill: Date.now(),
  interval: 60 * 1000, // 1 minute in milliseconds
  retryAfter: 0,
  remainingTokens: 100
};

// Initialize the tokenizer once and reuse it
const tokenizer = getEncoding("cl100k_base"); // Using GPT-4's encoding model

function countTokens(text: string): number {
  return tokenizer.encode(text).length;
}

function truncateText(text: string, maxTokens: number): string {
  const tokens = tokenizer.encode(text);
  if (tokens.length <= maxTokens) return text;
  return tokenizer.decode(tokens.slice(0, maxTokens));
}

interface Attachment {
  url: string;
  name: string;
  contentType: string;
}

interface ExtendedAttachment extends Attachment {
  originalName?: string;
}

function processDocument(attachment: { text: string; metadata?: any; name: string; originalName?: string; pdfUrl?: string }, chatId: string): DBMessage {
  const text = attachment.text;
  const displayName = attachment.originalName || attachment.name;
  
  // Add fallback values for all metadata fields
  const metadata = attachment.metadata || {};
  const metadataStr = `\nMetadata:\n` +
    `- Pages: ${metadata.pages || 'Unknown'}\n` +
    `- Language: ${metadata.language || 'Not specified'}\n` +
    `- File Type: ${metadata.fileType || 'Unknown'}\n` +
    `- Original Name: ${displayName}\n` +
    `- URL: ${attachment.pdfUrl || 'Not available'}`;
  
  // Calculate available tokens for the content
  const prefix = `Document Intelligence Analysis:\n\nContent from ${displayName}:${metadataStr}\n\n`;
  const prefixTokens = countTokens(prefix);
  const availableTokens = MAX_DOC_TOKENS - prefixTokens;
  
  // Truncate the content if necessary
  const truncatedText = truncateText(text, availableTokens);
  
  return {
    id: generateUUID(),
    chatId,
    role: 'system' as const,
    content: `${prefix}${truncatedText}`,
    createdAt: new Date().toISOString(),
    type: 'message' as const
  };
}

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const {
      id,
      messages: initialMessages,
      selectedChatModel,
    }: { id: string; messages: Array<AIMessage>; selectedChatModel: string } =
      await request.json();

    const userMessage = getMostRecentUserMessage(initialMessages);
    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const attachments = userMessage.experimental_attachments;
    let processedMessages = [...initialMessages];

    if (attachments?.length) {
      const jsonAttachments = attachments.filter(a => a.contentType === 'application/json') as ExtendedAttachment[];
      
      try {
        const userMessageWithoutAttachments = {
          ...userMessage,
          experimental_attachments: undefined
        };

        const processedAttachments = await Promise.all(
          jsonAttachments.map(async (attachment) => {
            try {
              const response = await fetch(attachment.url);
              const data = await response.json();
              return {
                text: data.text,
                metadata: data.metadata,
                name: attachment.name || 'unnamed.pdf',
                originalName: attachment.originalName || attachment.name,
                pdfUrl: data.url  // Get the URL from the JSON data
              };
            } catch (error) {
              console.error('Failed to fetch attachment content:', error);
              return null;
            }
          })
        );

        const validAttachments = processedAttachments.filter((a): a is NonNullable<typeof a> => a !== null);
        
        // Process documents and track total tokens
        let totalTokens = 0;
        const systemMessages: DBMessage[] = [];
        
        for (const attachment of validAttachments) {
          const message = processDocument(attachment, id);
          const messageTokens = countTokens(message.content);
          
          // Check if adding this document would exceed our token budget
          if (totalTokens + messageTokens > MAX_CONTEXT_TOKENS - RESERVE_TOKENS) {
            console.warn(`Skipping document ${attachment.name} due to token limit`);
            continue;
          }
          
          systemMessages.push(message);
          totalTokens += messageTokens;
        }

        const dbUserMessage = {
          id: userMessageWithoutAttachments.id,
          role: userMessageWithoutAttachments.role as DBMessage['role'],
          content: userMessageWithoutAttachments.content,
          createdAt: new Date().toISOString(),
          chatId: id,
          type: 'message' as const
        };

        // Save messages to database
        await saveMessages({
          messages: [dbUserMessage, ...systemMessages],
        });

        // Emit document context update
        await emitDocumentContextUpdate(id);

        const aiUserMessage = convertToUIMessages([dbUserMessage]);
        
        // Include messages within token limits
        processedMessages = [
          ...initialMessages.slice(0, -1),
          ...systemMessages.map(msg => ({
            id: msg.id,
            role: msg.role as AIMessage['role'],
            content: msg.content
          })),
          ...aiUserMessage
        ];
      } catch (error) {
        console.error('Error processing attachments:', error);
        return new Response('Error processing attachments', { status: 500 });
      }
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({ message: userMessage });
      await saveChat({ 
        id, 
        userId: session.user.id, 
        title,
        visibility: request.headers.get('x-visibility-type') as 'private' | 'public' || 'private'
      });
    }

    if (!attachments?.length) {
      await saveMessages({
        messages: [{ ...userMessage, createdAt: new Date().toISOString(), chatId: id, type: 'message' }],
      });
    }

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel }),
          messages: processedMessages,
          maxSteps: 5,
          experimental_activeTools: [
            'getWeather',
            'requestSuggestions',
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          onFinish: async ({ response, reasoning }) => {
            if (session.user?.id) {
              try {
                const sanitizedResponseMessages = sanitizeResponseMessages({
                  messages: response.messages,
                  reasoning,
                });

                const savedMessages = await saveMessages({
                  messages: sanitizedResponseMessages.map((message) => {
                    return {
                      id: generateUUID(),
                      chatId: id,
                      role: message.role,
                      content: message.content,
                      createdAt: new Date().toISOString(),
                      type: 'message'
                    };
                  }),
                });

                dataStream.writeData({
                  type: 'completion',
                  content: JSON.stringify({
                    messages: savedMessages
                  })
                });
              } catch (error) {
                console.error('Failed to save chat');
              }
            }
          },
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'stream-text',
          },
        });

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error: unknown) => {
        console.error('Error in chat stream:', error);
        if (error instanceof Error) {
          const match = error.message.match(/rate_limit_exceeded:(\d+)/);
          if (match) {
            const retryAfter = Number.parseInt(match[1]);
            return `Rate limit exceeded. Please try again in ${retryAfter} seconds.`;
          }
        }
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('Error in chat stream:', error);
    return new Response('Error in chat stream', { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (!chat || chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
