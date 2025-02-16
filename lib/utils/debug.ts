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
      // Enable all debugging in development by default
      DEBUG_NAMESPACES.add('all');
      localStorage.setItem('debug', 'all');
    }
  } catch (error) {
    console.error('Failed to initialize debug namespaces:', error);
  }
} else {
  // Enable all debugging on the server by default
  DEBUG_NAMESPACES.add('all');
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

export function debug(namespace: DebugNamespace, message: string, data?: any) {
  if (!isDebugEnabled(namespace)) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${namespace}]`;
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}:`, 
      typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    );
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