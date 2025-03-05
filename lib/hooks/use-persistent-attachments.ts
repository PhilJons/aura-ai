"use client";

import { useState, useEffect, useCallback } from 'react';
import { Attachment } from 'ai';
import { useLocalStorage } from 'usehooks-ts';

/**
 * Custom hook to manage persistent attachments across chat messages
 * This ensures that image attachments are preserved throughout the conversation
 */
export function usePersistentAttachments(chatId: string) {
  console.log("usePersistentAttachments - initialized with chatId:", chatId);
  
  // Store persistent attachments in localStorage to survive page refreshes
  const [persistentAttachments, setPersistentAttachments] = useLocalStorage<Attachment[]>(
    `chat-${chatId}-persistent-attachments`,
    []
  );

  // Add debugging logs
  useEffect(() => {
    console.log(`usePersistentAttachments - persistentAttachments for chat ${chatId}:`, persistentAttachments);
  }, [persistentAttachments, chatId]);

  // Add an attachment to the persistent list
  const addPersistentAttachment = useCallback((attachment: Attachment) => {
    console.log("usePersistentAttachments - adding attachment:", attachment);
    setPersistentAttachments(prev => {
      // Check if attachment already exists to avoid duplicates
      const exists = prev.some(a => a.url === attachment.url);
      if (exists) {
        console.log("usePersistentAttachments - attachment already exists, skipping");
        return prev;
      }
      console.log("usePersistentAttachments - attachment added");
      return [...prev, attachment];
    });
  }, [setPersistentAttachments]);

  // Add multiple attachments to the persistent list
  const addPersistentAttachments = useCallback((attachments: Attachment[]) => {
    console.log("usePersistentAttachments - adding multiple attachments:", attachments);
    setPersistentAttachments(prev => {
      const newAttachments = attachments.filter(attachment => 
        !prev.some(a => a.url === attachment.url)
      );
      console.log("usePersistentAttachments - new attachments to add:", newAttachments.length);
      return [...prev, ...newAttachments];
    });
  }, [setPersistentAttachments]);

  // Remove an attachment from the persistent list
  const removePersistentAttachment = useCallback((attachmentUrl: string) => {
    console.log("usePersistentAttachments - removing attachment with URL:", attachmentUrl);
    setPersistentAttachments(prev => 
      prev.filter(a => a.url !== attachmentUrl)
    );
  }, [setPersistentAttachments]);

  // Clear all persistent attachments
  const clearPersistentAttachments = useCallback(() => {
    console.log("usePersistentAttachments - clearing all attachments");
    setPersistentAttachments([]);
  }, [setPersistentAttachments]);

  return {
    persistentAttachments,
    addPersistentAttachment,
    addPersistentAttachments,
    removePersistentAttachment,
    clearPersistentAttachments
  };
} 