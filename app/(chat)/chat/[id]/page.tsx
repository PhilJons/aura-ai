"use client";

import { notFound } from "next/navigation";
import React from "react";
import { debug } from "@/lib/utils/debug";
import { useSessionWithUser } from "@/lib/hooks/use-session-with-user";
import { Chat } from "@/components/chat";

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
  debug('chat', 'ChatContainer render', { chatId, userId });
  
  // The Chat component will handle all data fetching internally
  return (
    <Chat
      id={chatId}
      initialMessages={[]}
      selectedChatModel="chat-model-small"
      selectedVisibilityType="private"
      isReadonly={false}
    />
  );
}