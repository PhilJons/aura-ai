/**
 * Debug utility functions for logging
 */

export type DebugNamespace = 
  | 'block'        // Block state management
  | 'document'     // Document operations
  | 'api'          // API calls
  | 'storage'      // Local storage operations
  | 'render'       // Component rendering
  | 'fetch'        // Data fetching
  | 'tool'         // Tool operations
  | 'message'      // Message processing
  | 'all';         // All debugging

const DEBUG_NAMESPACES = new Set<DebugNamespace>();

// Initialize debug namespaces
if (typeof window !== 'undefined') {
  try {
    const debug = localStorage.getItem('debug');
    if (debug) {
      debug.split(',').forEach(ns => {
        DEBUG_NAMESPACES.add(ns as DebugNamespace);
      });
    } else if (process.env.NODE_ENV === 'development') {
      // Only enable message and document debugging by default
      DEBUG_NAMESPACES.add('message');
      DEBUG_NAMESPACES.add('document');
      localStorage.setItem('debug', 'message,document');
    }
  } catch (error) {
    console.error('Failed to initialize debug namespaces:', error);
  }
} else {
  // Only enable message and document debugging on the server by default
  DEBUG_NAMESPACES.add('message');
  DEBUG_NAMESPACES.add('document');
}

export function enableDebug(namespace: DebugNamespace) {
  DEBUG_NAMESPACES.add(namespace);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('debug', Array.from(DEBUG_NAMESPACES).join(','));
    } catch (error) {
      console.error('Failed to save debug settings:', error);
    }
  }
}

export function disableDebug(namespace: DebugNamespace) {
  DEBUG_NAMESPACES.delete(namespace);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('debug', Array.from(DEBUG_NAMESPACES).join(','));
    } catch (error) {
      console.error('Failed to save debug settings:', error);
    }
  }
}

export function isDebugEnabled(namespace: DebugNamespace) {
  return DEBUG_NAMESPACES.has('all') || DEBUG_NAMESPACES.has(namespace);
}

// Add timestamp tracking for throttling
const lastLogTimestamps: { [key: string]: number } = {};
const THROTTLE_INTERVAL = 1000; // 1 second

// Add message signature tracking to prevent duplicates
const recentMessageSignatures = new Set<string>();
const MESSAGE_SIGNATURE_TTL = 2000; // 2 seconds

export function debug(namespace: DebugNamespace, message: string, data?: any) {
  if (!isDebugEnabled(namespace)) return;

  // Skip verbose block and render updates
  if (namespace === 'block' && (
    message.includes('Skipping block update') ||
    message.includes('Skipping metadata update') ||
    message.includes('Block component state') ||
    message.includes('Document fetch state') ||
    message.includes('Processing stream delta') ||
    message.includes('Updating block state') ||
    message.includes('Data stream update received')
  )) {
    return;
  }

  // Skip repetitive document updates
  if (namespace === 'document' && (
    message.includes('Creating editor instance') ||
    message.includes('Editor instance created') ||
    message.includes('Destroying editor instance')
  )) {
    return;
  }

  // Skip repetitive message updates
  if (namespace === 'message' && (
    message.includes('Chat initialization source') ||
    message.includes('Messages updated')
  )) {
    return;
  }

  // Generate a signature for the log message
  const signature = `${namespace}:${message}:${JSON.stringify(data)}`;

  // Check for duplicate messages within TTL
  if (recentMessageSignatures.has(signature)) {
    return;
  }

  // Throttle frequent messages
  const now = Date.now();
  const lastLog = lastLogTimestamps[signature] || 0;
  if (now - lastLog < THROTTLE_INTERVAL) {
    return;
  }

  // Update tracking
  lastLogTimestamps[signature] = now;
  recentMessageSignatures.add(signature);
  setTimeout(() => recentMessageSignatures.delete(signature), MESSAGE_SIGNATURE_TTL);

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${namespace}]`;
  
  if (data !== undefined) {
    // Limit data output size and filter sensitive or redundant fields
    const stringifiedData = typeof data === 'string' 
      ? data 
      : JSON.stringify(data, (key, value) => {
          if (typeof value === 'string' && value.length > 100) {
            return value.substring(0, 100) + '...';
          }
          // Skip logging certain verbose fields
          if (['content', 'contentLength', 'hasContent', 'isStreaming'].includes(key)) {
            return undefined;
          }
          return value;
        }, 2);
    console.log(`${prefix} ${message}:`, stringifiedData);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export function debugError(namespace: DebugNamespace, message: string, error: any) {
  if (!isDebugEnabled(namespace)) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${namespace}] [ERROR]`;
  
  console.error(`${prefix} ${message}:`, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  });
}

// Helper to wrap async functions with debug logging
export function debugAsync<T>(
  namespace: DebugNamespace,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!isDebugEnabled(namespace)) return fn();

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${namespace}]`;
  
  console.log(`${prefix} Starting ${name}`);
  const start = performance.now();
  
  return fn()
    .then(result => {
      const duration = performance.now() - start;
      console.log(`${prefix} Completed ${name} in ${duration.toFixed(2)}ms`);
      return result;
    })
    .catch(error => {
      const duration = performance.now() - start;
      console.error(`${prefix} Failed ${name} after ${duration.toFixed(2)}ms:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    });
}

// Development helper to temporarily enable debug logging
export function withDebug<T>(
  namespace: DebugNamespace,
  fn: () => T
): T {
  enableDebug(namespace);
  try {
    return fn();
  } finally {
    disableDebug(namespace);
  }
} 