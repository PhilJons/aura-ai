import type { NextRequest } from 'next/server';
import type { Message } from 'ai';
import { getMessagesByChatId, saveMessages } from '@/lib/db/queries';
import { debug } from '@/lib/utils/debug';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Missing chat ID', { status: 400 });
  }
  
  debug('message', 'Loading chat messages', { chatId: id });

  try {
    const messages = await getMessagesByChatId({ id });
    
    debug('message', 'Chat messages loaded', { 
      chatId: id,
      messageCount: messages.length,
      hasDocuments: messages.some(msg => 
        msg.content.includes('"kind":') && 
        (msg.content.includes('"text"') || 
         msg.content.includes('"code"') || 
         msg.content.includes('"image"') || 
         msg.content.includes('"sheet"'))
      )
    });

    return Response.json(messages);
  } catch (error) {
    console.error('Error loading messages:', error);
    return new Response('Error loading messages', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const { messages }: { messages: Message[] } = await request.json();

  if (!id) {
    return new Response('Missing chat ID', { status: 400 });
  }

  debug('message', 'Saving chat messages', { 
    chatId: id,
    messageCount: messages.length,
    hasDocuments: messages.some(msg => 
      msg.content.includes('"kind":') && 
      (msg.content.includes('"text"') || 
       msg.content.includes('"code"') || 
       msg.content.includes('"image"') || 
       msg.content.includes('"sheet"'))
    )
  });

  try {
    const savedMessages = await saveMessages({
      messages: messages.map((message) => ({
        id: message.id,
        chatId: id,
        content: message.content,
        role: message.role,
        createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : new Date().toISOString(),
        reasoning: message.reasoning,
        experimental_attachments: message.experimental_attachments,
        data: message.data,
        annotations: message.annotations,
        toolInvocations: message.toolInvocations,
        type: 'message'
      })),
    });

    debug('message', 'Chat messages saved', {
      chatId: id,
      savedCount: savedMessages.length,
      messageIds: savedMessages.map(msg => msg.id)
    });

    return Response.json(savedMessages);
  } catch (error) {
    console.error('Error saving messages:', error);
    return new Response('Error saving messages', { status: 500 });
  }
} 