import {
  type Message,
  createDataStreamResponse,
  type ToolCall,
  streamText,
  type ToolSet,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { createDocument } from '@/lib/ai/tools/create-document';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { getChatById, getMessagesByChatId, saveChat, saveMessages, deleteChatById } from '@/lib/db/queries';
import { Message as DBMessage } from '@/lib/db/schema';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { convertToUIMessages, getMostRecentUserMessage } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

export const maxDuration = 60;

async function handleToolCall({ tool, session, dataStream }: { 
  tool: ToolCall<string, any>;
  session: any;
  dataStream: any;
}) {
  // Implement tool call handling logic here
  return 'Tool call executed';
}

export async function POST(request: Request) {
  const {
    id,
    messages,
    selectedChatModel,
  }: { id: string; messages: Array<Message>; selectedChatModel: string } =
    await request.json();

  let chat = await getChatById({ id });
  let session = await auth();

  // For new chats, require authentication
  if (!chat) {
    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }
    const userMessage = getMostRecentUserMessage(messages);
    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }
    const title = await generateTitleFromUserMessage({ message: userMessage });
    chat = await saveChat({ 
      id, 
      userId: session.user.id, 
      title,
      visibility: request.headers.get('x-visibility-type') as 'private' | 'public' || 'private'
    });
  } else {
    // For existing chats, check visibility
    if (chat.visibility === 'private') {
      if (!session || !session.user || !session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
      if (chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // For public chats, only allow the owner to modify them
    if (session?.user?.id && session.user.id !== chat.userId) {
      return new Response('Unauthorized - only the chat owner can modify this chat', { status: 401 });
    }
  }

  const userMessage = getMostRecentUserMessage(messages);
  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  // Save the message if we have a valid session and either:
  // 1. The user is the chat owner, or
  // 2. The chat is public
  if (session?.user?.id && (session.user.id === chat.userId || chat.visibility === 'public')) {
    const dbMessage: DBMessage = {
      id: uuidv4(),
      chatId: id,
      role: userMessage.role,
      content: userMessage.content,
      createdAt: new Date().toISOString(),
      type: 'message'
    };

    await saveMessages({
      messages: [dbMessage],
    });
  }

  if (!chat) {
    return new Response('Failed to create chat', { status: 500 });
  }

  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        const dbMessages = await getMessagesByChatId({ id });
        const uiMessages = convertToUIMessages(dbMessages);

        // Generate message ID once
        const assistantMessageId = uuidv4();
        const assistantMessage: DBMessage = {
          id: assistantMessageId,
          chatId: id,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          type: 'message'
        };

        // Only include tools if we have a valid session and are the chat owner
        const tools: ToolSet = (session?.user?.id === chat.userId) ? {
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          getWeather,
          requestSuggestions: requestSuggestions({ session, dataStream }),
        } : {
          getWeather,
        };

        const result = await streamText({
          model: myProvider.languageModel(selectedChatModel),
          messages: uiMessages,
          tools,
        });

        // First merge the stream to show real-time updates to the user
        result.mergeIntoDataStream(dataStream);

        // Wait for the complete response before saving
        console.log('Waiting for complete response...');
        const response = await result.response;
        console.log('Got complete response:', JSON.stringify(response, null, 2));
        
        // Find the last assistant message with actual content
        const assistantMessages = response.messages.filter(msg => {
          if (msg.role !== 'assistant') return false;
          
          // Handle different content structures
          if (Array.isArray(msg.content)) {
            // Handle array of content blocks
            return msg.content.some(block => 
              block && typeof block === 'object' && 
              'text' in block && 
              typeof block.text === 'string' && 
              block.text.trim().length > 0
            );
          } else if (typeof msg.content === 'string') {
            // Handle simple string content
            return msg.content.trim().length > 0;
          }
          return false;
        }).map(msg => ({
          ...msg,
          content: Array.isArray(msg.content) 
            ? msg.content
                .filter(block => block && typeof block === 'object' && 'text' in block)
                .map(block => block.text)
                .join('\n')
            : msg.content
        }));
        
        console.log('Filtered assistant messages:', JSON.stringify(assistantMessages, null, 2));
        
        if (assistantMessages.length > 0) {
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
          console.log('Found last assistant message:', JSON.stringify(lastAssistantMessage, null, 2));
          
          // Create and save the assistant message with the complete content
          const assistantMessage: DBMessage = {
            id: uuidv4(),
            chatId: id,
            role: 'assistant',
            content: lastAssistantMessage.content,
            createdAt: new Date().toISOString(),
            type: 'message'
          };
          console.log('Created assistant message to save:', assistantMessage);

          // Only save if we have a valid session
          if (session?.user?.id === chat.userId) {
            console.log('User is chat owner, saving message...');
            await saveMessages({
              messages: [assistantMessage],
            });
            console.log('Successfully saved assistant message');
          } else {
            console.log('User is not chat owner, skipping save');
          }
        } else {
          console.log('No valid assistant messages found in response');
        }

        // Handle any tool calls after the main message is saved
        const toolCalls = await result.toolCalls;
        if (toolCalls && toolCalls.length > 0 && session?.user?.id === chat.userId) {
          console.log('Processing tool calls:', toolCalls.length);
          const toolResults = await Promise.all(
            toolCalls.map((tool) =>
              handleToolCall({
                tool,
                session,
                dataStream,
              }),
            ),
          );

          if (toolResults.some(result => result && result.trim())) {
            console.log('Saving tool results:', toolResults);
            const toolMessage: DBMessage = {
              id: uuidv4(),
              chatId: id,
              role: 'assistant',
              content: toolResults.filter(Boolean).join('\n'),
              createdAt: new Date().toISOString(),
              type: 'message'
            };

            await saveMessages({
              messages: [toolMessage],
            });
          }
        }
      } catch (error) {
        console.error('Error in chat stream:', error);
        dataStream.write('2:An error occurred while processing your request. Please try again.\n');
      }
    },
    onError: (error: unknown) => {
      // Only return error message for actual errors
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && !error.message.includes('message channel closed')) {
        console.error('Stream error:', error);
        return 'An error occurred. Please try again.';
      }
      return '';
    },
  });
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
