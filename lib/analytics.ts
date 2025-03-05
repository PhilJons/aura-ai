"use server"

import { track } from "@vercel/analytics/server"

/**
 * Analytics utility functions for tracking custom events
 */

/**
 * Track when a new chat is created
 * @param chatId The ID of the created chat
 */
export async function trackChatCreated(chatId: string) {
  await track("Chat Created", {
    chatId
  })
}

/**
 * Track when a message is sent
 * @param chatId The ID of the chat
 * @param role The role of the message sender (user/assistant)
 * @param messageLength The length of the message in characters
 */
export async function trackMessageSent(chatId: string, role: "user" | "assistant", messageLength: number) {
  await track("Message Sent", {
    chatId,
    role,
    messageLength
  })
}

/**
 * Track which model is used for a chat
 * @param chatId The ID of the chat
 * @param modelId The ID of the model being used
 */
export async function trackModelUsed(chatId: string, modelId: string) {
  await track("Model Used", {
    chatId,
    modelId
  })
}

/**
 * Track when a user changes the model
 * @param chatId The ID of the chat
 * @param fromModel The previous model ID
 * @param toModel The new model ID
 */
export async function trackModelChanged(chatId: string, fromModel: string, toModel: string) {
  await track("Model Changed", {
    chatId,
    fromModel,
    toModel
  })
}

/**
 * Track when a file is uploaded to a chat
 * @param chatId The ID of the chat
 * @param fileType The MIME type of the file
 * @param fileSize The size of the file in bytes
 */
export async function trackFileUploaded(chatId: string, fileType: string, fileSize: number) {
  await track("File Uploaded", {
    chatId,
    fileType,
    fileSize
  })
} 