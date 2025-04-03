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
  
  // Set the cookie first
  cookieStore.set('chat-model', modelToSave);
  
  // If a chatId is provided, also update the chat in the database
  if (chatId) {
    console.log(`[DB Update] Attempting to update chat model in database for chatId: ${chatId} to model: ${modelToSave}`);
    
    try {
      // First try to get the chat directly by ID (faster and more reliable)
      let chat: { id: string; model?: string; [key: string]: any } | undefined;
      try {
        const { resource } = await containers.chats.item(chatId, chatId).read();
        chat = resource;
        console.log(`[DB Update] Found chat directly by ID: ${chatId}`);
      } catch (directReadError: any) {
        console.log(`[DB Update] Direct read failed, trying query: ${directReadError?.message || 'Unknown error'}`);
        // Fall back to query if direct read fails
        const { resources } = await containers.chats.items
          .query({
            query: "SELECT * FROM c WHERE c.id = @id",
            parameters: [{ name: "@id", value: chatId }]
          })
          .fetchAll();
        
        chat = resources[0];
        console.log(`[DB Update] Query returned ${resources.length} results`);
      }
      
      if (chat) {
        console.log(`[DB Update] Current chat model: ${chat.model}, updating to: ${modelToSave}`);
        
        // Ensure chat has all required properties
        const updatedChat = {
          ...chat,
          model: modelToSave,
        };
        
        // Perform the upsert
        try {
          const { resource } = await containers.chats.items.upsert(updatedChat);
          console.log(`[DB Update] Update successful: ${resource?.id}`);
          
          // Double-check the update was successful
          const { resource: verifyResource } = await containers.chats.item(chatId, chatId).read();
          if (verifyResource?.model !== modelToSave) {
            console.error(`[DB Update] Verification failed! Expected ${modelToSave}, got ${verifyResource?.model}`);
          } else {
            console.log(`[DB Update] Verification successful, model is now: ${verifyResource.model}`);
          }
        } catch (upsertError: any) {
          // Try to handle specific upsert errors
          console.error(`[DB Update] Upsert failed: ${upsertError?.message || 'Unknown error'}`);
          
          // Try a direct replace as a fallback
          try {
            console.log(`[DB Update] Attempting direct replace as fallback`);
            const { resource } = await containers.chats.item(chatId, chatId).replace(updatedChat);
            console.log(`[DB Update] Replace successful: ${resource?.id}`);
          } catch (replaceError: any) {
            console.error(`[DB Update] Replace failed: ${replaceError?.message || 'Unknown error'}`);
            throw replaceError; // Propagate the error for further handling
          }
        }
      } else {
        console.error(`[DB Update] Chat not found with ID: ${chatId}`);
      }
    } catch (error: any) {
      console.error(`[DB Update] Error updating chat model: ${error?.message || 'Unknown error'}`, error?.stack);
      
      // Log detailed error information for debugging
      if (error?.code) {
        console.error(`[DB Update] Error code: ${error.code}`);
      }
      if (error?.body) {
        console.error(`[DB Update] Error body: ${JSON.stringify(error.body)}`);
      }
      
      // We don't throw here because we want the function to continue
      // Instead, we'll log a clear message that will help with debugging
      console.error(`[DB Update] FAILED TO UPDATE MODEL IN DATABASE. Cookie model is ${modelToSave} but database model may differ.`);
    }
  }
  
  return modelToSave;
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
