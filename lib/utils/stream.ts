const streamControllers = new Map<string, Set<ReadableStreamDefaultController>>();
const heartbeatIntervals = new Map<string, NodeJS.Timeout>();
const fileUploadsInProgress = new Set<string>();

export function addStreamController(chatId: string, controller: ReadableStreamDefaultController) {
  let controllers = streamControllers.get(chatId);
  if (!controllers) {
    controllers = new Set();
    streamControllers.set(chatId, controllers);
  }
  controllers.add(controller);
  console.log(`Adding stream controller for chat ${chatId}`);
}

export function removeStreamController(chatId: string, controller: ReadableStreamDefaultController) {
  const controllers = streamControllers.get(chatId);
  if (controllers) {
    controllers.delete(controller);
    if (controllers.size === 0) {
      streamControllers.delete(chatId);
      stopHeartbeat(chatId);
    }
  }
}

function startHeartbeat(chatId: string) {
  stopHeartbeat(chatId); // Clear existing first
  
  const interval = setInterval(() => {
    sendHeartbeat(chatId);
  }, 1000);

  // Auto-stop after 30s max duration
  setTimeout(() => {
    stopHeartbeat(chatId);
  }, 30000);

  heartbeatIntervals.set(chatId, interval);
}

function stopHeartbeat(chatId: string) {
  const interval = heartbeatIntervals.get(chatId);
  if (interval) {
    clearInterval(interval);
    heartbeatIntervals.delete(chatId);
  }
}

export function markFileUploadStarted(chatId: string) {
  fileUploadsInProgress.add(chatId);
  startHeartbeat(chatId);
}

export function markFileUploadComplete(chatId: string) {
  fileUploadsInProgress.delete(chatId);
  stopHeartbeat(chatId);
}

function sendHeartbeat(chatId: string) {
  const controllers = streamControllers.get(chatId);
  if (controllers) {
    for (const controller of controllers) {
      try {
        controller.enqueue('data: {"type":"heartbeat"}\n\n');
      } catch (error) {
        console.error('Error sending heartbeat:', error);
      }
    }
  }
}

export async function emitDocumentContextUpdate(chatId: string, hasImages = false) {
  const controllers = streamControllers.get(chatId);
  if (!controllers || controllers.size === 0) {
    console.log(`No active connections found for chat ${chatId}`);
    return;
  }

  // Send update
  for (const controller of controllers) {
    try {
      controller.enqueue(`data: {"type":"document-context-update","hasImages":${hasImages}}\n\n`);
    } catch (error) {
      console.error('Error sending document context update:', error);
    }
  }

  // Send completion after a short delay
  setTimeout(() => {
    const controllers = streamControllers.get(chatId);
    if (controllers) {
      for (const controller of controllers) {
        try {
          controller.enqueue('data: {"type":"document-context-update-complete"}\n\n');
        } catch (error) {
          console.error('Error sending document context update complete:', error);
        }
      }
    }
    stopHeartbeat(chatId);
  }, 2000);
}

export function writeDataToStream(chatId: string, data: any) {
  const controllers = streamControllers.get(chatId);
  if (controllers) {
    for (const controller of controllers) {
      try {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        console.error('Error writing data to stream:', error);
      }
    }
  }
} 