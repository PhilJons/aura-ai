import { auth } from '@/app/auth';
import { containers } from '@/lib/db/cosmos';
import type { Message } from '@/lib/db/schema';
import { getMessagesByChatId } from '@/lib/db/queries';
import { debug } from '@/lib/utils/debug';
import { convertToUIMessages } from '@/lib/utils';
import { emitDocumentContextUpdate } from '@/lib/utils/stream';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('chatId');
  const includeSystem = searchParams.get('includeSystem') === 'true';

  if (!id) {
    return new Response('Missing chat ID', { status: 400 });
  }
  
  debug('message', 'Loading chat messages', { chatId: id });

  try {
    const messages = await getMessagesByChatId({ id });
    
    // Only filter out system messages if not specifically requested
    const filteredMessages = includeSystem 
      ? messages 
      : messages.filter(msg => 
          !(msg.role === 'system' && typeof msg.content === 'string' && msg.content.startsWith('Document Intelligence Analysis:'))
        );
    
    // Convert to UI messages
    const uiMessages = convertToUIMessages(filteredMessages);
    
    debug('message', 'Chat messages loaded', { 
      chatId: id,
      messageCount: uiMessages.length,
      includesSystem: includeSystem,
      hasDocuments: uiMessages.some(msg => 
        msg.content.includes('"kind":') && 
        (msg.content.includes('"text"') || 
         msg.content.includes('"code"') || 
         msg.content.includes('"image"') || 
         msg.content.includes('"sheet"'))
      )
    });

    return Response.json(uiMessages);
  } catch (error) {
    console.error('Error loading messages:', error);
    return new Response('Error loading messages', { status: 500 });
  }
}

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

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');
  const messageId = searchParams.get('messageId');

  if (!chatId || !messageId) {
    return new Response('Missing required parameters', { status: 400 });
  }

  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // First verify the message exists and belongs to the chat
    const querySpec = {
      query: 'SELECT * FROM c WHERE c.id = @messageId AND c.chatId = @chatId AND c.type = "message"',
      parameters: [
        { name: '@messageId', value: messageId },
        { name: '@chatId', value: chatId }
      ]
    };

    const { resources } = await containers.messages.items.query(querySpec).fetchAll();
    const message = resources[0] as Message | undefined;

    if (!message) {
      return new Response('Message not found', { status: 404 });
    }

    // Delete the message using both id and partition key
    await containers.messages.item(messageId, chatId).delete();

    // Emit document context update if it was a system message
    if (message.role === 'system' && typeof message.content === 'string' && 
        message.content.startsWith('Document Intelligence Analysis:')) {
      await emitDocumentContextUpdate(chatId);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('Error deleting message:', error);
    return new Response('Error deleting message', { status: 500 });
  }
} 