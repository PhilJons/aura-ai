"use client"

import { track } from "@vercel/analytics"

/**
 * Client-side analytics utility functions for tracking custom events
 */

/**
 * Track when a user interacts with a UI element
 * @param elementName The name of the UI element
 * @param action The action performed (click, hover, etc.)
 */
export function trackUIInteraction(elementName: string, action: string) {
  track("UI Interaction", {
    elementName,
    action
  })
}

/**
 * Track when a user selects a model from the model selector
 * @param modelId The ID of the selected model
 */
export function trackModelSelection(modelId: string) {
  track("Model Selected", {
    modelId
  })
}

/**
 * Track when a user starts a new chat
 */
export function trackNewChatStarted() {
  track("New Chat Started")
}

/**
 * Track when a user opens an existing chat
 * @param chatId The ID of the opened chat
 */
export function trackChatOpened(chatId: string) {
  track("Chat Opened", {
    chatId
  })
}

/**
 * Track when a user toggles a feature or setting
 * @param featureName The name of the feature or setting
 * @param enabled Whether the feature is enabled or disabled
 */
export function trackFeatureToggled(featureName: string, enabled: boolean) {
  track("Feature Toggled", {
    featureName,
    enabled
  })
} 