"use client";
import React from "react";
import { debug } from "@/lib/utils/debug";
import { useSessionWithUser } from "@/lib/hooks/use-session-with-user";
import { Chat } from "@/components/chat";
import { useSearchParams } from "next/navigation";

// Map URL parameter values to internal model IDs
const URL_MODEL_MAP: Record<string, string> = {
  'gpt-4o': 'chat-model-large',
  'gpt-4o-mini': 'chat-model-small'
};

// Reverse mapping for internal model IDs to URL parameter values
const INTERNAL_MODEL_MAP: Record<string, string> = {
  'chat-model-large': 'gpt-4o',
  'chat-model-small': 'gpt-4o-mini'
};

// Default model if no parameter is present
const DEFAULT_MODEL = 'chat-model-small';

// Simplified chat page with minimal hooks to avoid ordering issues
export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  // Always resolve params first
  const { id: chatId } = React.use(params);
  
  // Session management - always call this hook first
  const { 
    session,
    isLoading: isSessionLoading,
    isAuthenticated
  } = useSessionWithUser();
  
  debug('chat', 'ChatPage render', {
    chatId,
    sessionUserId: session?.user?.id,
    hasSession: !!session,
    isAuthenticated,
    isSessionLoading
  });

  // Show loading state while session is loading
  if (isSessionLoading) {
    debug('chat', 'Session is loading', { isSessionLoading });
    return <div className="flex items-center justify-center h-full">Loading session...</div>;
  }

  // Require authentication
  if (!isAuthenticated || !session?.user?.id) {
    debug('chat', 'Session is not authenticated or missing user ID', { 
      isAuthenticated,
      hasUserId: !!session?.user?.id 
    });
    return <div className="flex items-center justify-center h-full">Please log in to access chats</div>;
  }

  // Render the chat component which will handle all data fetching internally
  return (
    <ChatContainer 
      chatId={chatId} 
      userId={session.user.id} 
    />
  );
}

// Separate component to handle data fetching after authentication is confirmed
function ChatContainer({ chatId, userId }: { chatId: string; userId: string }) {
  const searchParams = useSearchParams();
  const urlModel = searchParams.get('model');
  
  // Get model from URL parameter or use default
  const selectedModel = urlModel && URL_MODEL_MAP[urlModel] 
    ? URL_MODEL_MAP[urlModel] 
    : DEFAULT_MODEL;
  
  debug('chat', 'ChatContainer render', { 
    chatId, 
    userId, 
    urlModel,
    selectedModel 
  });
  
  // Ensure the URL includes the model parameter - but prioritize what's in the URL
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      const currentModelParam = currentUrl.searchParams.get('model');

      // If there's no model parameter at all, add one based on the selectedModel
      if (!currentModelParam) {
        const modelToUse = INTERNAL_MODEL_MAP[selectedModel] || 'gpt-4o-mini';
        
        console.log("ChatContainer - Adding missing model parameter:", {
          selectedModel,
          addingParam: modelToUse
        });
        
        currentUrl.searchParams.set('model', modelToUse);
        window.history.replaceState({}, '', currentUrl.toString());
        debug('chat', 'Added model parameter to URL', { addedParam: modelToUse });
      }
      // Otherwise, preserve the existing model parameter in the URL
    }
  }, [selectedModel]);
  
  // The Chat component will handle all data fetching internally
  return (
    <Chat
      key={`${chatId}-${urlModel || 'default'}`}
      id={chatId}
      initialMessages={[]}
      selectedChatModel={selectedModel}
      selectedVisibilityType="private"
      isReadonly={false}
    />
  );
}