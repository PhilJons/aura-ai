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

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

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

  let chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    chat = await saveChat({ id, userId: session.user.id, title });
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

        // We don't need to save empty message anymore since we'll save the full one later
        // Just keep track of the message object

        const tools = {
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          getWeather,
          requestSuggestions: requestSuggestions({ session, dataStream }),
        };

        const result = await streamText({
          model: myProvider.languageModel(selectedChatModel),
          messages: uiMessages,
          tools,
        });

        result.mergeIntoDataStream(dataStream);

        const response = await result.response;
        const lastMessage = response.messages[response.messages.length - 1];
        assistantMessage.content = typeof lastMessage.content === 'string' ? lastMessage.content : '';
        
        // Save the message once with complete content
        await saveMessages({
          messages: [assistantMessage],
        });

        const toolCalls = await result.toolCalls;
        if (toolCalls && toolCalls.length > 0) {
          const toolResults = await Promise.all(
            toolCalls.map((tool) =>
              handleToolCall({
                tool,
                session,
                dataStream,
              }),
            ),
          );

          const toolMessage: DBMessage = {
            id: uuidv4(),
            chatId: id,
            role: 'assistant',
            content: toolResults.join('\n'),
            createdAt: new Date().toISOString(),
            type: 'message'
          };

          await saveMessages({
            messages: [toolMessage],
          });
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
