"use server"

import { track } from "@vercel/analytics/server"

/**
 * Analytics utility functions for tracking custom events
 */

/**
 * Categorizes message length into predefined spans for better analytics grouping
 * @param length The exact message length
 * @returns A string representing the length span category
 */
function getMessageLengthCategory(length: number): string {
  if (length <= 10) return "1-10";
  if (length <= 50) return "11-50";
  if (length <= 150) return "51-150";
  if (length <= 500) return "151-500";
  if (length <= 1000) return "501-1000";
  return "1000+";
}

/**
 * Categorizes file types into meaningful groups for better analytics
 * @param fileType The MIME type of the file
 * @returns A string representing the file type category
 */
function getFileTypeCategory(fileType: string): string {
  // Images
  if (fileType.startsWith('image/')) {
    if (fileType === 'image/jpeg' || fileType === 'image/jpg') return 'Image: JPEG';
    if (fileType === 'image/png') return 'Image: PNG';
    if (fileType === 'image/gif') return 'Image: GIF';
    if (fileType === 'image/webp') return 'Image: WebP';
    if (fileType === 'image/svg+xml') return 'Image: SVG';
    return 'Image: Other';
  }
  
  // Documents
  if (fileType === 'application/pdf') return 'Document: PDF';
  if (fileType === 'application/msword' || 
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'Document: Word';
  }
  if (fileType === 'application/vnd.ms-excel' || 
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return 'Document: Excel';
  }
  if (fileType === 'application/vnd.ms-powerpoint' || 
      fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return 'Document: PowerPoint';
  }
  
  // Text files
  if (fileType === 'text/plain') return 'Text: Plain';
  if (fileType === 'text/markdown' || fileType === 'text/x-markdown') return 'Text: Markdown';
  if (fileType === 'text/csv') return 'Text: CSV';
  if (fileType === 'text/html') return 'Text: HTML';
  
  // Code files
  if (fileType === 'text/javascript' || fileType === 'application/javascript') return 'Code: JavaScript';
  if (fileType === 'text/typescript' || fileType === 'application/typescript') return 'Code: TypeScript';
  if (fileType === 'text/x-python' || fileType === 'application/x-python') return 'Code: Python';
  if (fileType.includes('json')) return 'Code: JSON';
  if (fileType.includes('xml')) return 'Code: XML';
  
  // Archives
  if (fileType === 'application/zip' || 
      fileType === 'application/x-zip-compressed') return 'Archive: ZIP';
  if (fileType === 'application/x-rar-compressed') return 'Archive: RAR';
  if (fileType === 'application/x-tar' || fileType === 'application/gzip') return 'Archive: TAR/GZ';
  
  // Audio
  if (fileType.startsWith('audio/')) return 'Audio';
  
  // Video
  if (fileType.startsWith('video/')) return 'Video';
  
  // Fallback
  return 'Other';
}

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
    // Use the length category instead of exact length
    messageLengthCategory: getMessageLengthCategory(messageLength)
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
  // Categorize file size into spans
  let fileSizeCategory: string;
  const fileSizeMB = fileSize / (1024 * 1024);
  
  if (fileSizeMB <= 0.1) fileSizeCategory = "0-100KB";
  else if (fileSizeMB <= 0.5) fileSizeCategory = "100KB-500KB";
  else if (fileSizeMB <= 1) fileSizeCategory = "500KB-1MB";
  else if (fileSizeMB <= 5) fileSizeCategory = "1MB-5MB";
  else if (fileSizeMB <= 10) fileSizeCategory = "5MB-10MB";
  else fileSizeCategory = "10MB+";
  
  // Get the file type category
  const fileTypeCategory = getFileTypeCategory(fileType);
  
  await track("File Uploaded", {
    chatId,
    fileType,
    fileTypeCategory,
    fileSizeCategory,
    userEmail: userEmail || "anonymous"
  })
} 