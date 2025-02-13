import { auth } from '@/app/(auth)/auth';
import { containers } from '@/lib/db/cosmos';
import type { Message } from '@/lib/db/schema';

export async function PATCH(request: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const message = await request.json() as Message;
    console.log('Received message update request:', {
      messageId: message.id,
      chatId: message.chatId,
      content: message.content,
      role: message.role,
      type: message.type
    });

    if (!message || !message.id || !message.chatId || !message.content) {
      const error = `Invalid message data: ${JSON.stringify({
        hasMessage: !!message,
        hasId: !!message?.id,
        hasChatId: !!message?.chatId,
        hasContent: !!message?.content,
        messageId: message?.id,
        chatId: message?.chatId
      })}`;
      console.error(error);
      return new Response(error, { status: 400 });
    }

    // First verify the message exists
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @id AND c.type = "message"',
      parameters: [
        { name: '@id', value: message.id }
      ]
    };
    
    console.log('Searching for existing message with query:', querySpec);
    const { resources } = await containers.messages.items.query(querySpec).fetchAll();
    const existingMessage = resources[0] as Message | undefined;

    if (!existingMessage) {
      const error = `Message not found with id: ${message.id}`;
      console.error(error);
      return new Response(error, { status: 404 });
    }

    console.log('Found existing message:', {
      messageId: existingMessage.id,
      chatId: existingMessage.chatId,
      content: existingMessage.content,
      role: existingMessage.role,
      type: existingMessage.type
    });

    // Update the message using upsert
    const updatedMessage: Message = {
      ...existingMessage,
      content: message.content,
      chatId: existingMessage.chatId, // Use the existing chatId instead of the provided one
      type: 'message' as const
    };

    console.log('Attempting to save updated message:', {
      messageId: updatedMessage.id,
      chatId: updatedMessage.chatId,
      content: updatedMessage.content,
      role: updatedMessage.role,
      type: updatedMessage.type
    });
    const { resource } = await containers.messages.items.upsert(updatedMessage);

    if (!resource) {
      throw new Error('Failed to save message - no resource returned from upsert operation');
    }

    console.log('Successfully saved updated message:', resource);
    return Response.json(resource);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error updating message:', {
      error,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return new Response(errorMessage, { status: 500 });
  }
} 