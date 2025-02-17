const DEBUG_ENABLED = process.env.DEBUG_MODE === 'true';

type LogCategory = 'upload' | 'document' | 'blob' | 'api';
type LogLevel = 'info' | 'error' | 'debug';

interface LogMessage {
  category: LogCategory;
  message: string;
  data?: any;
  timestamp: string;
  level: LogLevel;
}

function formatLogMessage({ category, message, data, timestamp, level }: LogMessage): string {
  return `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${
    data ? `\n${JSON.stringify(data, null, 2)}` : ''
  }`;
}

export function log(
  category: LogCategory,
  message: string,
  data?: any,
  level: LogLevel = 'info'
) {
  if (!DEBUG_ENABLED && level === 'debug') return;

  const logMessage = formatLogMessage({
    category,
    message,
    data,
    timestamp: new Date().toISOString(),
    level,
  });

  if (level === 'error') {
    console.error(logMessage);
  } else {
    console.log(logMessage);
  }
}

export const logger = {
  upload: {
    info: (message: string, data?: any) => log('upload', message, data, 'info'),
    error: (message: string, data?: any) => log('upload', message, data, 'error'),
    debug: (message: string, data?: any) => log('upload', message, data, 'debug'),
  },
  document: {
    info: (message: string, data?: any) => log('document', message, data, 'info'),
    error: (message: string, data?: any) => log('document', message, data, 'error'),
    debug: (message: string, data?: any) => log('document', message, data, 'debug'),
  },
  blob: {
    info: (message: string, data?: any) => log('blob', message, data, 'info'),
    error: (message: string, data?: any) => log('blob', message, data, 'error'),
    debug: (message: string, data?: any) => log('blob', message, data, 'debug'),
  },
  api: {
    info: (message: string, data?: any) => log('api', message, data, 'info'),
    error: (message: string, data?: any) => log('api', message, data, 'error'),
    debug: (message: string, data?: any) => log('api', message, data, 'debug'),
  },
}; 