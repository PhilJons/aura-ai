import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { convertToUIMessages } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL, chatModels } from '@/lib/ai/models';
import type { Message as AIMessage } from 'ai';
import type { Message as DBMessage } from '@/lib/db/schema';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id });

  if (!chat) {
    notFound();
  }

  const session = await auth();

  if (chat.visibility === 'private') {
    if (!session || !session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  // Separate system messages and regular messages
  const [systemMessages, regularMessages] = messagesFromDb.reduce<[DBMessage[], DBMessage[]]>(
    (acc, msg) => {
      if (msg.role === 'system' && typeof msg.content === 'string' && msg.content.startsWith('Document Intelligence Analysis:')) {
        acc[0].push(msg);
      } else {
        acc[1].push(msg);
      }
      return acc;
    },
    [[], []]
  );

  // Convert regular messages for UI display
  const uiMessages = convertToUIMessages(regularMessages.map(msg => ({
    ...msg,
    experimental_attachments: msg.attachments ? JSON.parse(msg.attachments) : []
  })));

  // Convert system messages for AI context
  const aiSystemMessages = systemMessages.map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content
  } as AIMessage));

  // Combine UI messages with system messages for complete context
  // System messages should be at the beginning of the context
  const initialMessages = [...aiSystemMessages, ...uiMessages];

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');

  // Validate that the model exists and is enabled
  const modelFromCookie = chatModelFromCookie?.value;
  const isValidModel = modelFromCookie && chatModels.some(m => m.id === modelFromCookie && m.enabled);
  const selectedModel = isValidModel ? modelFromCookie : DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={initialMessages}
        selectedChatModel={selectedModel}
        selectedVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
