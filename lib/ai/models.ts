import { openai } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import { customProvider } from 'ai';

// Check for client-side environment variables
if (!process.env.NEXT_PUBLIC_AZURE_OPENAI_API_KEY) {
  throw new Error('NEXT_PUBLIC_AZURE_OPENAI_API_KEY is not set');
}

if (!process.env.NEXT_PUBLIC_AZURE_OPENAI_RESOURCE_NAME) {
  throw new Error('NEXT_PUBLIC_AZURE_OPENAI_RESOURCE_NAME is not set');
}

if (!process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
  throw new Error('NEXT_PUBLIC_OPENAI_API_KEY is not set (needed for image generation)');
}

export const DEFAULT_CHAT_MODEL: string = 'chat-model-small';

// Debug logging function with timestamp
const debugLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Azure OpenAI Debug] ${message}`, data || '');
};

const createModel = (modelName: string) => {
  const apiKey = process.env.NEXT_PUBLIC_AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Azure OpenAI API key is not configured');
  }

  const baseConfig = {
    apiKey,
    apiVersion: '2024-02-15-preview',
  };

  if (modelName === 'gpt-4o' || modelName === 'gpt-4o-mini') {
    // For GPT-4o and GPT-4o mini, use Azure OpenAI endpoint
    const provider = createAzure({
      ...baseConfig,
      resourceName: process.env.NEXT_PUBLIC_AZURE_OPENAI_RESOURCE_NAME,
    });
    return provider.chat(modelName === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini');
  } else {
    // For DeepSeek and Llama, use Azure AI endpoint
    const deploymentMap: { [key: string]: string } = {
      'deepseek': 'deepseek-r1',
      'llama': 'Llama-3.3-70B-Instruct'
    };
    
    const deploymentName = deploymentMap[modelName.toLowerCase()];
    if (!deploymentName) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    // Use Azure OpenAI SDK with the AI services endpoint
    const provider = createAzure({
      ...baseConfig,
      resourceName: process.env.NEXT_PUBLIC_AZURE_OPENAI_RESOURCE_NAME,
      baseURL: `https://${process.env.NEXT_PUBLIC_AZURE_OPENAI_RESOURCE_NAME}.services.ai.azure.com/models`,
    });
    return provider.chat(deploymentName);
  }
};

// Create model instances with enhanced error handling
const createModelWithLogging = (displayName: string, modelName: string) => {
  try {
    debugLog(`Creating ${displayName} model`);
    return createModel(modelName);
  } catch (error) {
    console.error(`Error creating ${displayName} model:`, error);
    throw error;
  }
};

// Create all models using the chat interface with logging
const gpt4o = createModelWithLogging('GPT-4o', 'gpt-4o');
const gpt4omini = createModelWithLogging('GPT-4o mini', 'gpt-4o-mini');
const deepseek = createModelWithLogging('DeepSeek', 'deepseek');
const llama = createModelWithLogging('Llama', 'llama');

// Add global error handler for debugging
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    debugLog('Unhandled Promise Rejection:', {
      reason: event.reason,
      stack: event.reason?.stack,
      message: event.reason?.message
    });
  });

  window.addEventListener('error', (event) => {
    debugLog('Global Error:', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error
    });
  });
}

debugLog('Creating custom provider with models');
export const myProvider = customProvider({
  languageModels: {
    'chat-model-small': gpt4omini,
    'chat-model-large': gpt4o,
    'chat-model-reasoning': deepseek,
    'chat-model-advanced': llama,
    'title-model': gpt4o,
    'block-model': gpt4o,
  },
  imageModels: {
    'small-model': openai.image('dall-e-2'),
    'large-model': openai.image('dall-e-3'),
  },
});

debugLog('Custom provider created successfully');

interface ChatModel {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model-small',
    name: 'GPT-4o mini',
    description: 'Fast and efficient for most tasks',
    enabled: true,
  },
  {
    id: 'chat-model-large',
    name: 'GPT-4o',
    description: 'Most capable model for complex tasks',
    enabled: true,
  },
  {
    id: 'chat-model-reasoning',
    name: 'DeepSeek',
    description: 'Advanced reasoning with DeepSeek model',
    enabled: false,  // Temporarily disabled
  },
  {
    id: 'chat-model-advanced',
    name: 'Llama 70B',
    description: 'Advanced tasks with Llama 70B model',
    enabled: false,  // Temporarily disabled
  },
];
