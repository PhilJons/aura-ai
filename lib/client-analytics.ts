"use client"

import { track } from "@vercel/analytics"

/**
 * Client-side analytics utility functions for tracking custom events
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
 * Track when a user interacts with a UI element
 * @param elementName The name of the UI element
 * @param action The action performed (click, hover, etc.)
 * @param userEmail The email of the user interacting with the UI
 */
export function trackUIInteraction(elementName: string, action: string, userEmail?: string) {
  const eventData: Record<string, any> = {
    elementName,
    action
  }
  
  if (userEmail) {
    eventData.userEmail = userEmail
  }
  
  track("UI Interaction", eventData)
}

/**
 * Track when a user selects a model from the model selector
 * @param modelId The ID of the selected model
 * @param userEmail The email of the user selecting the model
 */
export function trackModelSelection(modelId: string, userEmail?: string) {
  const eventData: Record<string, any> = {
    modelId
  }
  
  if (userEmail) {
    eventData.userEmail = userEmail
  }
  
  track("Model Selected", eventData)
}

/**
 * Track when a user starts a new chat
 * @param userEmail The email of the user starting the chat
 */
export function trackNewChatStarted(userEmail?: string) {
  const eventData: Record<string, any> = {}
  
  if (userEmail) {
    eventData.userEmail = userEmail
  }
  
  track("New Chat Started", eventData)
}

/**
 * Track when a user opens an existing chat
 * @param chatId The ID of the opened chat
 * @param userEmail The email of the user opening the chat
 */
export function trackChatOpened(chatId: string, userEmail?: string) {
  const eventData: Record<string, any> = {
    chatId
  }
  
  if (userEmail) {
    eventData.userEmail = userEmail
  }
  
  track("Chat Opened", eventData)
}

/**
 * Track when a user toggles a feature or setting
 * @param featureName The name of the feature or setting
 * @param enabled Whether the feature is enabled or disabled
 * @param userEmail The email of the user toggling the feature
 */
export function trackFeatureToggled(featureName: string, enabled: boolean, userEmail?: string) {
  const eventData: Record<string, any> = {
    featureName,
    enabled
  }
  
  if (userEmail) {
    eventData.userEmail = userEmail
  }
  
  track("Feature Toggled", eventData)
}

/**
 * Track when a user sends a message from the client side
 * @param chatId The ID of the chat
 * @param messageLength The length of the message in characters
 * @param userEmail The email of the user sending the message
 */
export function trackClientMessageSent(chatId: string, messageLength: number, userEmail?: string) {
  const eventData: Record<string, any> = {
    chatId,
    messageLengthCategory: getMessageLengthCategory(messageLength)
  }
  
  if (userEmail) {
    eventData.userEmail = userEmail
  }
  
  track("Client Message Sent", eventData)
}

/**
 * Track when a file is uploaded from the client side
 * @param chatId The ID of the chat
 * @param fileType The MIME type of the file
 * @param fileSize The size of the file in bytes
 * @param userEmail The email of the user uploading the file
 */
export function trackClientFileUploaded(chatId: string, fileType: string, fileSize: number, userEmail?: string) {
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
  
  const eventData: Record<string, any> = {
    chatId,
    fileType,
    fileTypeCategory,
    fileSizeCategory
  }
  
  if (userEmail) {
    eventData.userEmail = userEmail
  }
  
  track("Client File Uploaded", eventData)
} 