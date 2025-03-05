"use client"

import { track } from "@vercel/analytics"

/**
 * Client-side analytics utility functions for tracking custom events
 */

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