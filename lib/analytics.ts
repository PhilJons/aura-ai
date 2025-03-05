"use server"

import { track } from "@vercel/analytics/server"

/**
 * Analytics utility functions for tracking custom events
 */

/**
 * Track when a new chat is created
 * @param chatId The ID of the created chat
 * @param userEmail The email of the user creating the chat
 */
export async function trackChatCreated(chatId: string, userEmail?: string) {
  await track("Chat Created", {
    chatId,
    userEmail: userEmail || "anonymous"
  })
}

/**
 * Track when a message is sent
 * @param chatId The ID of the chat
 * @param role The role of the message sender (user/assistant)
 * @param messageLength The length of the message in characters
 * @param userEmail The email of the user sending the message
 */
export async function trackMessageSent(chatId: string, role: "user" | "assistant", messageLength: number, userEmail?: string) {
  const eventData: Record<string, any> = {
    chatId,
    role,
    messageLength
  }
  
  // Only add userEmail for user messages and if it exists
  if (role === "user" && userEmail) {
    eventData.userEmail = userEmail
  }
  
  await track("Message Sent", eventData)
}

/**
 * Track which model is used for a chat
 * @param chatId The ID of the chat
 * @param modelId The ID of the model being used
 * @param userEmail The email of the user using the model
 */
export async function trackModelUsed(chatId: string, modelId: string, userEmail?: string) {
  await track("Model Used", {
    chatId,
    modelId,
    userEmail: userEmail || "anonymous"
  })
}

/**
 * Track when a user changes the model
 * @param chatId The ID of the chat
 * @param fromModel The previous model ID
 * @param toModel The new model ID
 * @param userEmail The email of the user changing the model
 */
export async function trackModelChanged(chatId: string, fromModel: string, toModel: string, userEmail?: string) {
  await track("Model Changed", {
    chatId,
    fromModel,
    toModel,
    userEmail: userEmail || "anonymous"
  })
}

/**
 * Track when a file is uploaded to a chat
 * @param chatId The ID of the chat
 * @param fileType The MIME type of the file
 * @param fileSize The size of the file in bytes
 * @param userEmail The email of the user uploading the file
 */
export async function trackFileUploaded(chatId: string, fileType: string, fileSize: number, userEmail?: string) {
  await track("File Uploaded", {
    chatId,
    fileType,
    fileSize,
    userEmail: userEmail || "anonymous"
  })
} 