import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL, chatModels } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';

// Map internal model IDs to URL parameter values
const INTERNAL_MODEL_MAP: Record<string, string> = {
  'chat-model-large': 'gpt-4o',
  'chat-model-small': 'gpt-4o-mini'
};

// Map URL parameter values to internal model IDs
const URL_MODEL_MAP: Record<string, string> = {
  'gpt-4o': 'chat-model-large',
  'gpt-4o-mini': 'chat-model-small'
};

export default async function Page({ searchParams }: { searchParams: { model?: string } }) {
  const id = generateUUID();

  // Get model from URL parameter
  const urlModel = searchParams.model;
  console.log("[Page] URL model parameter:", urlModel);
  
  // Get model from cookie as fallback
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');
  console.log("[Page] Model from cookie:", modelIdFromCookie?.value);

  // Determine which model to use
  let selectedModel = DEFAULT_CHAT_MODEL;
  let modelSource = "default";
  
  // First check URL parameter
  if (urlModel && URL_MODEL_MAP[urlModel]) {
    selectedModel = URL_MODEL_MAP[urlModel];
    modelSource = "url";
    console.log(`[Page] Using model from URL: ${urlModel} -> ${selectedModel}`);
  } 
  // Then check cookie
  else if (modelIdFromCookie?.value) {
    // Validate that the model exists and is enabled
    const modelFromCookie = modelIdFromCookie.value;
    const isValidModel = modelFromCookie && chatModels.some(m => m.id === modelFromCookie && m.enabled);
    
    if (isValidModel) {
      selectedModel = modelFromCookie;
      modelSource = "cookie";
      console.log(`[Page] Using model from cookie: ${modelFromCookie}`);
      
      // Redirect to include the model parameter in the URL
      if (INTERNAL_MODEL_MAP[selectedModel]) {
        const redirectUrl = `/?model=${INTERNAL_MODEL_MAP[selectedModel]}`;
        console.log(`[Page] Redirecting to: ${redirectUrl}`);
        redirect(redirectUrl);
      }
    }
  }

  console.log(`[Page] Final selected model: ${selectedModel} (source: ${modelSource})`);

  return (
    <>
      <Chat
        key={`new-chat-${urlModel || 'default'}`}
        id={id}
        initialMessages={[]}
        selectedChatModel={selectedModel}
        selectedVisibilityType="private"
        isReadonly={false}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
