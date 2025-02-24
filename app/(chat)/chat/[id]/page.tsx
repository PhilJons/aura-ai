"use client";

import { notFound } from "next/navigation";
import { useSession } from "next-auth/react";
import { Messages } from "@/components/messages";
import React from "react";

// Example layout with replaced session.email check
export default function ChatPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const chatId = params.id;

  // Instead of checking session.user.email, we now check session.user.id
  if (!session?.user?.id) {
    return notFound();
  }

  // Additional ownership check if chat is private
  // This part is just an example; the real code may differ
  // if (chat.visibility === "private" && session.user.id !== chat.userId) {
  //   return notFound();
  // }

  // Render the chat
  return (
    <div className="flex-1 flex flex-col">
      <Messages chatId={chatId} />
    </div>
  );
}