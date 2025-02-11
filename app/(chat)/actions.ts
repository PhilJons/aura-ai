'use server';

import { generateText, Message } from 'ai';
import { cookies } from 'next/headers';

import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import { VisibilityType } from '@/components/visibility-selector';
import { myProvider, chatModels, DEFAULT_CHAT_MODEL } from '@/lib/ai/models';

export async function saveChatModelAsCookie(model: string) {
  // Validate that the model exists and is enabled
  const isValidModel = chatModels.some(m => m.id === model && m.enabled);
  const modelToSave = isValidModel ? model : DEFAULT_CHAT_MODEL;
  
  const cookieStore = await cookies();
  cookieStore.set('chat-model', modelToSave);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: Message;
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel('title-model'),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const message = await getMessageById({ id });
  
  if (!message) {
    throw new Error('Message not found');
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: new Date(message.createdAt),
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}

export async function clearChatCookies() {
  const cookieStore = await cookies();
  cookieStore.delete('chat-model');
  // Add any other chat-related cookies that need to be cleared
}
