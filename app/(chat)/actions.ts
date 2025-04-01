'use server';

import { generateText, type Message } from 'ai';
import { cookies } from 'next/headers';
import { auth } from '@/app/auth';

import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';
import { myProvider, chatModels, DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { containers } from '@/lib/db/cosmos';
import { trackModelChanged } from '@/lib/analytics';

export async function saveChatModelAsCookie(model: string, chatId?: string) {
  // Validate that the model exists and is enabled
  const isValidModel = chatModels.some(m => m.id === model && m.enabled);
  const modelToSave = isValidModel ? model : DEFAULT_CHAT_MODEL;
  
  const cookieStore = await cookies();
  const previousModel = cookieStore.get('chat-model')?.value || DEFAULT_CHAT_MODEL;
  
  // Get the user's email from the session
  const session = await auth();
  const userEmail = session?.user?.email;
  
  // Only track if the model is actually changing
  if (previousModel !== modelToSave) {
    // We don't have a chatId here, so we'll use 'global' to indicate this is a global setting change
    await trackModelChanged(chatId || 'global', previousModel, modelToSave, userEmail || undefined);
  }
  
  cookieStore.set('chat-model', modelToSave);
  
  // If a chatId is provided, also update the chat in the database
  if (chatId) {
    try {
      // Find the chat
      const { resources: [chat] } = await containers.chats.items
        .query({
          query: "SELECT * FROM c WHERE c.id = @id",
          parameters: [{ name: "@id", value: chatId }]
        })
        .fetchAll();
      
      if (chat) {
        // Update the chat's model
        chat.model = modelToSave;
        await containers.chats.items.upsert(chat);
      }
    } catch (error) {
      console.error('Error updating chat model in database:', error);
      // Don't throw - we still want to set the cookie even if DB update fails
    }
  }
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

export async function getChatModelFromCookies() {
  const cookieStore = await cookies();
  const model = cookieStore.get('chat-model')?.value || DEFAULT_CHAT_MODEL;
  console.log(`[COOKIE DEBUG] Current chat model from cookies: ${model}`);
  return model;
}

export async function clearChatCookies() {
  const cookieStore = await cookies();
  cookieStore.delete('chat-model');
  // Add any other chat-related cookies that need to be cleared
}

export async function updateMessage({ id, content }: { id: string; content: string }) {
  try {
    const message = await getMessageById({ id });
    
    if (!message) {
      throw new Error('Message not found');
    }

    // Preserve the original message structure
    const updatedMessage = {
      id: message.id,
      chatId: message.chatId,
      role: message.role,
      content,
      createdAt: message.createdAt,
      type: 'message' as const
    };

    try {
      // Use chatId as partition key
      const { resource } = await containers.messages.items.upsert(updatedMessage);
      
      if (!resource) {
        throw new Error('Failed to update message');
      }

      // Delete all messages that came after this one
      await deleteTrailingMessages({ id });

      return resource;
    } catch (error) {
      console.error('Error updating message in database:', error);
      throw new Error('Failed to update message in database');
    }
  } catch (error) {
    console.error('Error in updateMessage:', error);
    throw error; // Re-throw to handle in the UI
  }
}
