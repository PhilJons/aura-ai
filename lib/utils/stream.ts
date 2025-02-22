

const STREAM_CONNECTIONS = new Map<string, Set<ReadableStreamController>>();

interface ReadableStreamController {
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
  error: (error: Error) => void;
}

export function addStreamController(chatId: string, controller: ReadableStreamController) {
  console.log(`Adding stream controller for chat ${chatId}`);
  if (!STREAM_CONNECTIONS.has(chatId)) {
    STREAM_CONNECTIONS.set(chatId, new Set());
  }
  STREAM_CONNECTIONS.get(chatId)?.add(controller);
  console.log(`Active connections for chat ${chatId}: ${STREAM_CONNECTIONS.get(chatId)?.size}`);
}

export function removeStreamController(chatId: string, controller: ReadableStreamController) {
  console.log(`Removing stream controller for chat ${chatId}`);
  const connections = STREAM_CONNECTIONS.get(chatId);
  if (!connections) return;

  connections.delete(controller);
  console.log(`Remaining connections for chat ${chatId}: ${connections.size}`);

  if (connections.size === 0) {
    STREAM_CONNECTIONS.delete(chatId);
    console.log(`Removed all connections for chat ${chatId}`);
  }
}

export async function emitDocumentContextUpdate(chatId: string) {
  console.log(`Emitting document context update for chat ${chatId}`);
  const controllers = STREAM_CONNECTIONS.get(chatId);
  
  if (!controllers || controllers.size === 0) {
    console.log(`No active connections found for chat ${chatId}`);
    return;
  }

  console.log(`Found ${controllers.size} active connections for chat ${chatId}`);
  const encoder = new TextEncoder();
  const message = encoder.encode(
    `data: ${JSON.stringify({ 
      type: 'document-context-update',
      timestamp: new Date().toISOString()
    })}\n\n`
  );

  const failedControllers = new Set<ReadableStreamController>();

  controllers.forEach((controller) => {
    try {
      controller.enqueue(message);
      console.log(`Successfully sent update to a controller for chat ${chatId}`);
    } catch (error) {
      console.error(`Error sending document context update for chat ${chatId}:`, error);
      failedControllers.add(controller);
    }
  });

  // Clean up failed controllers
  failedControllers.forEach(controller => {
    removeStreamController(chatId, controller);
  });

  if (failedControllers.size > 0) {
    console.log(`Removed ${failedControllers.size} failed controllers for chat ${chatId}`);
  }
} 