import {
  type Message as AIMessage,
  type Attachment as AIAttachment,
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
import { processDocument, type ProcessedDocument } from '@/lib/azure/document';

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

// Extend the Attachment type to include our custom properties
type CustomAttachment = AIAttachment & {
  isAzureExtractedJson?: boolean;
  associatedPdfName?: string;
};

function createSystemMessage(attachment: { text: string; metadata?: any; name: string; originalName?: string; pdfUrl?: string }, chatId: string): DBMessage {
  const text = attachment.text;
  const displayName = attachment.originalName || attachment.name;
  
  // Add fallback values for all metadata fields
  const metadata = attachment.metadata || {};
  const metadataStr = `\nMetadata:\n- Pages: ${metadata.pages || 'Unknown'}\n- Language: ${metadata.language || 'Not specified'}\n- File Type: ${metadata.fileType || 'Unknown'}\n- Original Name: ${displayName}\n- URL: ${attachment.pdfUrl || 'Not available'}`;
  
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

    // Get existing system messages from the conversation
    const existingSystemMessages = initialMessages.filter(
      msg => msg.role === 'system' && 
      typeof msg.content === 'string' && 
      msg.content.startsWith('Document Intelligence Analysis:')
    );

    if (attachments?.length) {
      // Mark file upload started
      await emitDocumentContextUpdate(id);

      // Separate attachments by type
      const imageAttachments = attachments.filter(a => a.contentType?.startsWith('image/'));
      
      // Define text-based file types
      const TEXT_BASED_TYPES = [
        'text/plain',
        'text/markdown',
        'text/x-markdown',
        'text/javascript',
        'application/javascript',
        'text/typescript',
        'application/typescript',
        'text/x-typescript',
        'text/jsx',
        'text/tsx',
        'text/css',
        'text/html',
        'text/x-python',
        'application/x-python',
        'text/x-java',
        'text/x-c',
        'text/x-c++',
        'text/x-go',
        'text/x-rust',
        'text/x-ruby',
        'text/x-php',
        'text/x-swift',
        'text/x-kotlin',
        'text/x-scala',
        'text/csv',
        'text/yaml',
        'text/x-yaml',
        'application/json',
        'text/xml'
      ];

      const documentAttachments = attachments.filter((a) => {
        const customAttachment = a as CustomAttachment;
        return !!(customAttachment.contentType && (
          // Handle extracted JSON from PDFs
          (customAttachment.contentType === 'application/json' && customAttachment.isAzureExtractedJson) || 
          // Handle PDFs
          customAttachment.contentType === 'application/pdf' || 
          // Handle all text-based files
          TEXT_BASED_TYPES.includes(customAttachment.contentType)
        ));
      });

      // Create a copy of the user message that preserves image attachments
      const userMessageWithImages = {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        experimental_attachments: imageAttachments
      };

      // Process each document attachment
      const validContents: Array<{ text: string; metadata?: any; name: string; originalName?: string; pdfUrl?: string }> = [];

      for (const attachment of documentAttachments as CustomAttachment[]) {
        try {
          const { contentType, name, url } = attachment;
          if (!contentType || !name || !url) {
            console.warn('Skipping attachment due to missing required fields:', attachment);
            continue;
          }

          // Log for debugging
          console.log('Processing attachment:', { name, contentType, url });

          // Handle JSON files that contain extracted PDF content
          if (contentType === 'application/json' && attachment.isAzureExtractedJson) {
            const response = await fetch(url);
            const json = await response.json();
            validContents.push({
              text: json.text,
              metadata: json.metadata,
              name,
              originalName: json.originalName,
              pdfUrl: json.pdfUrl
            });
            continue;
          }

          // Handle PDFs using Azure Document Intelligence
          if (contentType === 'application/pdf') {
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const result = await processDocument(buffer, contentType, name);
            validContents.push({
              text: result.text,
              metadata: {
                pages: result.pages,
                fileType: result.fileType,
                language: result.language,
                images: result.images
              },
              name,
              pdfUrl: url
            });
            continue;
          }

          // Handle other text-based files
          if (TEXT_BASED_TYPES.includes(contentType)) {
            const response = await fetch(url);
            const text = await response.text();
            validContents.push({
              text,
              metadata: {
                fileType: contentType,
                pages: 1
              },
              name
            });
            continue;
          }

          console.warn(`Unsupported content type: ${contentType}`);
        } catch (error) {
          console.error('Error processing attachment:', error);
        }
      }

      // Create system messages for each valid content
      const newSystemMessages: DBMessage[] = [];
      let totalTokens = countTokens(existingSystemMessages.map(msg => msg.content).join('\n'));

      for (const content of validContents) {
        const message = createSystemMessage(content, id);
        const messageTokens = countTokens(message.content);
        
        // Check if adding this document would exceed our token budget
        if (totalTokens + messageTokens > MAX_CONTEXT_TOKENS - RESERVE_TOKENS) {
          console.warn(`Skipping document ${content.name} due to token limit`);
          continue;
        }
        
        newSystemMessages.push(message);
        totalTokens += messageTokens;
      }

      // Save the user message with attachments
      const dbUserMessage: DBMessage = {
        id: userMessage.id,
        chatId: id,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: new Date().toISOString(),
        type: 'message',
        attachments: JSON.stringify(userMessageWithImages.experimental_attachments || [])
      };

      // Save messages to the database
      await saveMessages({
        messages: [{
          ...dbUserMessage
        }, ...newSystemMessages],
      });

      // Only emit document context update if we have new system messages or images
      if (newSystemMessages.length > 0 || imageAttachments.length > 0) {
        await emitDocumentContextUpdate(id, imageAttachments.length > 0);
      }

      // Combine existing system messages with new ones and prepare for OpenAI
      processedMessages = [
        ...existingSystemMessages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content
        })),
        ...newSystemMessages.map(msg => ({
          id: msg.id,
          role: msg.role as AIMessage['role'],
          content: msg.content
        })),
        ...initialMessages.filter(msg => msg.role !== 'system' && msg.id !== userMessage.id).map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content
        })),
        userMessageWithImages // Use the version with image attachments
      ];

      // Debug logging for message processing
      console.log('[DEBUG] [chat] Processing messages:', {
        totalMessages: processedMessages.length,
        systemMessages: processedMessages.filter(msg => msg.role === 'system').length,
        systemMessageSummary: processedMessages
          .filter(msg => msg.role === 'system')
          .map(msg => ({
            id: msg.id,
            contentPreview: typeof msg.content === 'string' 
              ? `${msg.content.substring(0, 100)}...` 
              : 'Non-string content'
          }))
      });

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
    } else {
      // If no attachments, just save the user message and keep existing system messages
      await saveMessages({
        messages: [{ 
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          createdAt: new Date().toISOString(), 
          chatId: id, 
          type: 'message' 
        }],
      });

      // Keep existing system messages and strip attachments from all messages
      processedMessages = [
        ...existingSystemMessages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content
        })),
        ...initialMessages.filter(msg => msg.role !== 'system' && msg.id !== userMessage.id).map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content
        })),
        {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content
        }
      ];
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
