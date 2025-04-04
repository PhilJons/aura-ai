import {
  type Message as AIMessage,
  type Attachment as AIAttachment,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/auth';
import { myProvider, DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
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
  sanitizeResponseMessages,
} from '@/lib/utils';
import { emitDocumentContextUpdate } from '@/lib/utils/stream';
import { generateTitleFromUserMessage, } from '@/app/(chat)/actions';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getEncoding } from 'js-tiktoken';
import { processDocument, } from '@/lib/azure/document';
import { trackMessageSent, trackModelUsed } from '@/lib/analytics';
import { searchTool } from '@/lib/ai/tools/search';
import { cookies } from 'next/headers';

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
  pdfUrl?: string;
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

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const requestBody = await request.json();

    // Get the search-enabled state from the cookie
    const searchEnabledHeader = request.headers.get('x-search-enabled') === 'true';
    
    // Get the model from cookie
    const cookieStore = await cookies();
    const userEmail = session.user.email;
    const chatModelFromCookie = cookieStore.get('chat-model')?.value || DEFAULT_CHAT_MODEL;
    
    // Use model from request if provided, otherwise use cookie model
    const chatModelFromRequest = requestBody.model || chatModelFromCookie;
    
    // Check if web search should be enabled for this model
    const searchSupportedModels = new Set(['chat-model-large', 'chat-model-small']);
    
    // Check if the search toggle is enabled
    const searchToggleEnabled = searchEnabledHeader === true;
    
    // Special handling for o3-mini with search
    let modelToUseForRequest = chatModelFromRequest;
    if (searchToggleEnabled && chatModelFromRequest === 'chat-model-o3-mini') {
      // Fall back to the large model when o3-mini is selected with search enabled
      modelToUseForRequest = 'chat-model-large';
      console.log(`[MODEL FALLBACK] Search enabled with o3-mini, using large model instead`);
    }
    
    const isSearchEnabled = searchToggleEnabled && searchSupportedModels.has(modelToUseForRequest);
    
    console.log(`[MODEL SELECTION] Using model: ${modelToUseForRequest} for chat: ${requestBody.id}, search enabled: ${isSearchEnabled}`);
    
    // Early check if we need to handle attachments
    const attachments = requestBody.messages.filter((msg: { attachments?: any[] }) => msg.attachments && msg.attachments.length > 0);
    
    // Normalize the message structure for processing
    let processedMessages = [...requestBody.messages] as any[];

    // Check if we need to handle attachments or documents in this request
    if (attachments.length > 0) {
      // First, save the user message
      await saveMessages({
        messages: [{ 
          id: requestBody.messages[0].id,
          role: requestBody.messages[0].role,
          content: requestBody.messages[0].content,
          createdAt: new Date().toISOString(), 
          chatId: requestBody.id, 
          type: 'message' 
        }],
      });
      
      // Get any existing system messages
      const existingSystemMessages = requestBody.messages.filter((msg: { role: string }) => msg.role === 'system');
      
      console.log(`Found ${existingSystemMessages.length} existing system messages`);
      
      // Look up the chat
      const chat = await getChatById({ id: requestBody.id });
      
      // Log the model comparison after chat lookup
      console.log(`[MODEL COMPARISON] 
        Cookie Model: ${chatModelFromCookie}
        Selected Model (from request): ${requestBody.model || "Not specified in request"}
        Chat Model (if exists): ${chat?.model || "Not found (new chat)"}`);
      
      // Track which model is being used for this message with user email
      await trackModelUsed(requestBody.id, modelToUseForRequest, userEmail || undefined);

      // Debug logging
      console.log(`[MODEL COMPARISON] 
        Cookie Model: ${modelToUseForRequest}
        Selected Model (from request): ${modelToUseForRequest}
        Chat Model (if exists): ${chat?.model || 'Not found (new chat)'}
      `);

      // Track the user message being sent with user email
      await trackMessageSent(
        requestBody.id, 
        'user', 
        typeof requestBody.messages[0].content === 'string' 
          ? requestBody.messages[0].content.length 
          : JSON.stringify(requestBody.messages[0].content).length,
        userEmail || undefined
      );

      // Process each document attachment
      const validContents: Array<{ text: string; metadata?: any; name: string; originalName?: string; pdfUrl?: string }> = [];

      for (const attachment of attachments as CustomAttachment[]) {
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
            
            // Log the PDF URL for debugging
            console.log('Processing JSON with PDF content:', { 
              name, 
              pdfUrl: json.pdfUrl || attachment.pdfUrl || 'No PDF URL found'
            });
            
            validContents.push({
              text: json.text,
              metadata: json.metadata,
              name,
              originalName: json.originalName,
              pdfUrl: json.pdfUrl || attachment.pdfUrl
            });
            continue;
          }

          // Handle PDFs using Azure Document Intelligence
          if (contentType === 'application/pdf') {
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const result = await processDocument(buffer, contentType, name);
            
            // Log the PDF URL for debugging
            console.log('Processing PDF directly:', { 
              name, 
              url,
              pdfUrl: attachment.pdfUrl || url
            });
            
            validContents.push({
              text: result.text,
              metadata: {
                pages: result.pages,
                fileType: result.fileType,
                language: result.language,
                images: result.images
              },
              name,
              pdfUrl: attachment.pdfUrl || url
            });
            continue;
          }

          // Handle other text-based files
          if (searchSupportedModels.has(contentType)) {
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
      let totalTokens = countTokens(existingSystemMessages.map((msg: { content: string }) => msg.content).join('\n'));

      for (const content of validContents) {
        const message = createSystemMessage(content, requestBody.id);
        const messageTokens = countTokens(message.content);
        
        // Check if adding this document would exceed our token budget
        if (totalTokens + messageTokens > MAX_CONTEXT_TOKENS - RESERVE_TOKENS) {
          console.warn(`Skipping document ${content.name} due to token limit`);
          continue;
        }
        
        newSystemMessages.push(message);
        totalTokens += messageTokens;
      }

      // Save messages to the database
      await saveMessages({
        messages: [{
          ...requestBody.messages[0]
        }, ...newSystemMessages],
      });

      // Only emit document context update if we have new system messages or images
      if (newSystemMessages.length > 0 || attachments.length > 0) {
        await emitDocumentContextUpdate(requestBody.id, attachments.length > 0);
      }

      // Combine existing system messages with new ones and prepare for OpenAI
      processedMessages = [
        ...existingSystemMessages.map((msg: { id: string; role: string; content: string }) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content
        })),
        ...newSystemMessages.map((msg: DBMessage) => ({
          id: msg.id,
          role: msg.role as AIMessage['role'],
          content: msg.content
        })),
        ...requestBody.messages.filter((msg: { role: string; id: string }) => msg.role !== 'system' && msg.id !== requestBody.messages[0].id).map((msg: { id: string; role: string; content: unknown }) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content
        })),
        requestBody.messages[0]
      ];

      // Debug logging for message processing
      console.log('[DEBUG] [chat] Processing messages:', {
        totalMessages: processedMessages.length,
        systemMessages: processedMessages.filter((msg: { role: string }) => msg.role === 'system').length,
        systemMessageSummary: processedMessages
          .filter((msg: { role: string }) => msg.role === 'system')
          .map((msg: { id: string; content: unknown }) => ({
            id: msg.id,
            contentPreview: typeof msg.content === 'string' 
              ? `${msg.content.substring(0, 100)}...` 
              : 'Non-string content'
          }))
      });

      if (!chat) {
        const title = await generateTitleFromUserMessage({ message: requestBody.messages[0] });
        
        console.log(`[CHAT CREATION] Creating new chat with model: ${modelToUseForRequest}`);
        
        await saveChat({ 
          id: requestBody.id, 
          userId: session.user.id, 
          title,
          visibility: request.headers.get('x-visibility-type') as 'private' | 'public' || 'private',
          model: modelToUseForRequest
        });
      } else {
        // Check if user has permission to modify this chat
        if (chat.visibility === 'private' && chat.userId !== session.user.id) {
          return new Response('Unauthorized', { status: 401 });
        }
      }

      return createDataStreamResponse({
        execute: (dataStream) => {
          console.log(`[MODEL DEBUG] Using model for chat ${requestBody.id}: ${modelToUseForRequest} (from request body)`);
          console.log(`[MODEL DEBUG] Chat model from database: ${chat?.model || 'Not found in DB'}`);
          
          // Always use the model from the request, which comes from the cookie
          // This ensures consistency between what the user sees and what's used
          const modelToUse = modelToUseForRequest;
          console.log(`[MODEL DEBUG] Final model selected: ${modelToUse}`);
          
          const result = streamText({
            model: myProvider.languageModel(modelToUse),
            system: systemPrompt({ selectedChatModel: modelToUse, isSearchEnabled }),
            messages: processedMessages,
            maxSteps: 5,
            experimental_activeTools: [
              // 'getWeather',
              'requestSuggestions',
              ...(isSearchEnabled ? ['search' as const] : []),
            ],
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            tools: {
              // getWeather,
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
              }),
              ...(isSearchEnabled ? { search: searchTool } : {}),
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
                        chatId: requestBody.id,
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

                  // Track the assistant message
                  if (savedMessages.length > 0) {
                    const assistantMessage = savedMessages.find(msg => msg.role === 'assistant');
                    if (assistantMessage) {
                      await trackMessageSent(
                        requestBody.id,
                        'assistant',
                        assistantMessage.content.length,
                        userEmail || undefined
                      );
                    }
                  }
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
          id: requestBody.messages[0].id,
          role: requestBody.messages[0].role,
          content: requestBody.messages[0].content,
          createdAt: new Date().toISOString(), 
          chatId: requestBody.id, 
          type: 'message' 
        }],
      });

      // Keep existing system messages and strip attachments from all messages
      processedMessages = [
        ...requestBody.messages.filter((msg: { role: string; id: string }) => msg.role !== 'system' && msg.id !== requestBody.messages[0].id).map((msg: { id: string; role: string; content: unknown }) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content
        })),
        {
          id: requestBody.messages[0].id,
          role: requestBody.messages[0].role,
          content: requestBody.messages[0].content
        }
      ];
    }

    const chat = await getChatById({ id: requestBody.id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({ message: requestBody.messages[0] });
      
      console.log(`[CHAT CREATION] Creating new chat with model: ${modelToUseForRequest}`);
      
      await saveChat({ 
        id: requestBody.id, 
        userId: session.user.id, 
        title,
        visibility: request.headers.get('x-visibility-type') as 'private' | 'public' || 'private',
        model: modelToUseForRequest
      });
    } else {
      // Check if user has permission to modify this chat
      if (chat.visibility === 'private' && chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    return createDataStreamResponse({
      execute: (dataStream) => {
        console.log(`[MODEL DEBUG] Using model for chat ${requestBody.id}: ${modelToUseForRequest} (from request body)`);
        console.log(`[MODEL DEBUG] Chat model from database: ${chat?.model || 'Not found in DB'}`);
        
        // Always use the model from the request, which comes from the cookie
        // This ensures consistency between what the user sees and what's used
        const modelToUse = modelToUseForRequest;
        console.log(`[MODEL DEBUG] Final model selected: ${modelToUse}`);
      
        const result = streamText({
          model: myProvider.languageModel(modelToUse),
          system: systemPrompt({ selectedChatModel: modelToUse, isSearchEnabled }),
          messages: processedMessages,
          maxSteps: 5,
          experimental_activeTools: [
            // 'getWeather',
            'requestSuggestions',
            ...(isSearchEnabled ? ['search' as const] : []),
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            // getWeather,
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
            ...(isSearchEnabled ? { search: searchTool } : {}),
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
                      chatId: requestBody.id,
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

                // Track the assistant message
                if (savedMessages.length > 0) {
                  const assistantMessage = savedMessages.find(msg => msg.role === 'assistant');
                  if (assistantMessage) {
                    await trackMessageSent(
                      requestBody.id,
                      'assistant',
                      assistantMessage.content.length,
                      userEmail || undefined
                    );
                  }
                }
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
    console.error('Error in POST handler:', error);
    return new Response('Error', { status: 500 });
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (!chat) {
      return new Response('Not Found', { status: 404 });
    }

    // Only allow access if chat is public or owned by the user
    if (chat.visibility === 'private' && chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    return Response.json(chat);
  } catch (error) {
    console.error('Error fetching chat:', error);
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
