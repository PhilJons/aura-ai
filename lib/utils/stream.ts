const streamControllers = new Map<string, Set<ReadableStreamDefaultController>>();
const heartbeatIntervals = new Map<string, NodeJS.Timeout>();
const heartbeatTimeouts = new Map<string, NodeJS.Timeout>();
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
  
  console.log(`Starting heartbeat for chat ${chatId}`);
  
  const interval = setInterval(() => {
    sendHeartbeat(chatId);
  }, 1000);

  // Auto-stop after 120s max duration (2 minutes) to prevent indefinite heartbeats
  const timeout = setTimeout(() => {
    console.log(`Heartbeat timeout reached for chat ${chatId}`);
    stopHeartbeat(chatId);
  }, 120000); // 2 minutes

  heartbeatIntervals.set(chatId, interval);
  heartbeatTimeouts.set(chatId, timeout);
}

function stopHeartbeat(chatId: string) {
  console.log(`Stopping heartbeat for chat ${chatId}`);
  
  const interval = heartbeatIntervals.get(chatId);
  if (interval) {
    clearInterval(interval);
    heartbeatIntervals.delete(chatId);
  }
  
  const timeout = heartbeatTimeouts.get(chatId);
  if (timeout) {
    clearTimeout(timeout);
    heartbeatTimeouts.delete(chatId);
  }
}

// Extend the current heartbeat timeout for a chat
export function extendHeartbeatTimeout(chatId: string) {
  console.log(`Extending heartbeat timeout for chat ${chatId}`);
  
  // Clear existing timeout
  const existingTimeout = heartbeatTimeouts.get(chatId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Set a new timeout
  const newTimeout = setTimeout(() => {
    console.log(`Extended heartbeat timeout reached for chat ${chatId}`);
    stopHeartbeat(chatId);
  }, 120000); // 2 minutes
  
  heartbeatTimeouts.set(chatId, newTimeout);
}

export function markFileUploadStarted(chatId: string) {
  console.log(`Marking file upload started for chat ${chatId}`);
  fileUploadsInProgress.add(chatId);
  startHeartbeat(chatId);
}

export function markFileUploadComplete(chatId: string) {
  console.log(`Marking file upload complete for chat ${chatId}`);
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
    // Don't stop the heartbeat here - it will be explicitly stopped by markFileUploadComplete
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