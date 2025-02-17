import {
  type Message,
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
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';

// Azure OpenAI rate limit handling
const azureRateLimit = {
  tokens: 100,
  lastRefill: Date.now(),
  interval: 60 * 1000, // 1 minute in milliseconds
  retryAfter: 0,
  remainingTokens: 100
};

function handleRateLimit(headers?: Headers) {
  const now = Date.now();
  
  // If we have headers from Azure, update our rate limit info
  if (headers) {
    const retryAfter = headers.get('retry-after');
    const remainingTokens = headers.get('x-ratelimit-remaining-tokens');
    const resetTokens = headers.get('x-ratelimit-reset-tokens');
    
    if (retryAfter) {
      azureRateLimit.retryAfter = now + (Number.parseInt(retryAfter) * 1000);
      throw new Error(`rate_limit_exceeded:${retryAfter}`);
    }
    
    if (remainingTokens) {
      azureRateLimit.remainingTokens = Number.parseInt(remainingTokens);
    }
    
    if (resetTokens) {
      azureRateLimit.interval = Number.parseInt(resetTokens) * 1000;
    }
  }
  
  // Check if we're still in retry period
  if (azureRateLimit.retryAfter > now) {
    const waitTime = Math.ceil((azureRateLimit.retryAfter - now) / 1000);
    throw new Error(`rate_limit_exceeded:${waitTime}`);
  }

  // Normal token bucket logic
  const timePassed = now - azureRateLimit.lastRefill;
  if (timePassed >= azureRateLimit.interval) {
    azureRateLimit.tokens = 100;
    azureRateLimit.lastRefill = now;
    azureRateLimit.remainingTokens = 100;
  }

  if (azureRateLimit.tokens <= 0 || azureRateLimit.remainingTokens <= 0) {
    throw new Error('rate_limit_exceeded:60');
  }

  azureRateLimit.tokens--;
  azureRateLimit.remainingTokens = Math.max(0, azureRateLimit.remainingTokens - 1);
  return true;
}

// Extended type for attachments that may include extracted text
interface ExtendedAttachment {
  url: string;
  name: string;
  contentType: string;
  text?: string;
  metadata?: {
    pages?: number;
    fileType?: string;
    originalName?: string;
    language?: string;
  };
}

export const maxDuration = 300; // Increased to 5 minutes to handle retries

export async function POST(request: Request) {
  try {
    // Check rate limit
    handleRateLimit();

    const {
      id,
      messages,
      selectedChatModel,
    }: { id: string; messages: Array<Message>; selectedChatModel: string } =
      await request.json();

    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    // Process any PDF attachments to include their text content
    const attachments = userMessage.experimental_attachments as ExtendedAttachment[] | undefined;
    if (attachments && attachments.length > 0) {
      // Filter out the PDF attachments and only keep the JSON ones with extracted text
      const jsonAttachments = attachments.filter(a => a.contentType === 'application/json');
      
      try {
        // Fetch content for all JSON attachments (which contain extracted text)
        const processedAttachments = await Promise.all(
          jsonAttachments.map(async (attachment) => {
            try {
              const response = await fetch(attachment.url);
              const data = await response.json();
              return {
                text: data.text,
                metadata: data.metadata,
                name: attachment.name.replace('.json', '.pdf') // Restore original PDF name
              };
            } catch (error) {
              console.error('Failed to fetch attachment content:', error);
              return null;
            }
          })
        );

        // Filter out failed fetches and format the content
        const attachmentsWithText = processedAttachments
          .filter(Boolean)
          .map(attachment => {
            const metadata = attachment?.metadata;
            const metadataStr = metadata ? 
              `\nMetadata:\n- Pages: ${metadata.pages}\n- Language: ${metadata.language}\n- File Type: ${metadata.fileType}` : '';
            return `Content from ${attachment?.name}:${metadataStr}\n\n${attachment?.text}`;
          });

        if (attachmentsWithText.length > 0) {
          // Combine the original message with the extracted text
          userMessage.content = `${userMessage.content}\n\nAttached documents:\n${attachmentsWithText.join('\n\n---\n\n')}`;
        }

        // Remove the attachments from the message since we've extracted the text
        userMessage.experimental_attachments = undefined;
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

    await saveMessages({
      messages: [{ ...userMessage, createdAt: new Date().toISOString(), chatId: id, type: 'message' }],
    });

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel }),
          messages: messages.map(msg => ({
            ...msg,
            experimental_attachments: undefined // Remove attachments from all messages
          })),
          maxSteps: 5,
          experimental_activeTools: [
            'getWeather',
            'createDocument',
            'updateDocument',
            'requestSuggestions',
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
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

                await saveMessages({
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
    console.error('Error in chat endpoint:', error);
    if (error instanceof Error) {
      const match = error.message.match(/rate_limit_exceeded:(\d+)/);
      if (match) {
        const retryAfter = Number.parseInt(match[1]);
        return new Response(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`, { 
          status: 429,
          headers: {
            'Retry-After': match[1]
          }
        });
      }
    }
    return new Response('An error occurred', { status: 500 });
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
