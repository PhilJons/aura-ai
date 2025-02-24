/**
 * Debug utility functions for logging
 */

export type DebugNamespace = 
  | 'chat'      // Chat operations
  | 'db'        // Database operations
  | 'auth'      // Authentication
  | 'storage'   // Storage operations
  | 'message'   // Message processing
  | 'document'  // Document operations
  | 'block'     // Block operations
  | 'api'       // API operations
  | 'render'    // Rendering
  | 'fetch'     // Data fetching
  | 'tool'      // Tool operations
  | 'all';      // All debugging

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

export function debug(namespace: DebugNamespace, message: string, data?: Record<string, any>) {
  console.log(`[DEBUG] [${namespace}] ${message}`, data || '');
}

export function debugError(namespace: DebugNamespace, message: string, data?: Record<string, any>) {
  console.error(`[ERROR] [${namespace}] ${message}`, data || '');
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