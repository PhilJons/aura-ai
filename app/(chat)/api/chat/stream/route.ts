import { auth } from '@/app/auth';
import { addStreamController, removeStreamController } from '@/lib/utils/stream';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new Response('Missing chat ID', { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      console.log(`Starting new SSE connection for chat ${chatId}`);
      
      // Add this controller to the chat's stream connections
      addStreamController(chatId, controller);

      // Send an initial message with timestamp
      const initialMessage = {
        type: 'connected',
        timestamp: new Date().toISOString()
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initialMessage)}\n\n`)
      );

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        console.log(`SSE connection aborted for chat ${chatId}`);
        removeStreamController(chatId, controller);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
} 