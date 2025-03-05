// <ai_context> Client component for the chat's multimodal input. </ai_context>

"use client";

import type {
  Attachment,
  ChatRequestOptions,
  CreateMessage,
  Message,
} from "ai";
import cx from "classnames";
import type React from "react";
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from "react";
import { toast } from "sonner";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { sanitizeUIMessages } from "@/lib/utils";
import equal from "fast-deep-equal";
import { logger } from "@/lib/utils/logger";
import { useDirectFileUpload } from "@/components/ui/direct-file-upload";
import { cn } from "@/lib/utils";
import { UploadProgress } from "@/components/upload-progress";
import { trackFileUploaded } from '@/lib/analytics';
import { trackClientMessageSent, trackClientFileUploaded } from '@/lib/client-analytics';

// Icons
function ArrowUpIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function StopIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
    </svg>
  );
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      width={size}
      height={size}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

import { PreviewAttachment } from "./preview-attachment";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { SuggestedActions } from "./suggested-actions";

interface CustomAttachment extends Attachment {
  isAzureExtractedJson?: boolean;
  associatedPdfName?: string;
  originalName?: string;
  pdfUrl?: string;
}

interface MultimodalInputProps {
  chatId: string;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  stop: () => void;
  attachments: Array<CustomAttachment>;
  setAttachments: Dispatch<SetStateAction<Array<CustomAttachment>>>;
  messages: Array<Message>;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  handleSubmit: (
    event?: {
      preventDefault?: () => void;
    },
    chatRequestOptions?: ChatRequestOptions,
  ) => void;
  className?: string;
  selectedChatModel: string;
  setIsProcessingFile: Dispatch<SetStateAction<boolean>>;
  isExistingChat?: boolean;
}

function validateFileType(file: File, selectedChatModel: string) {
  // For GPT-4o mini, only allow PDFs and text files
  if (selectedChatModel === "chat-model-small") {
    const allowedTypes = ["application/pdf", "text/plain"];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Only PDF and text documents are supported with GPT-4o Mini");
    }
    return true;
  }
  
  // For other models, allow images as well
  const allowedTypes = ["application/pdf", "text/plain", "image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Unsupported file type. Please upload PDF, text, or image files.");
  }
  return true;
}

function PureMultimodalInput({
  chatId,
  input,
  setInput,
  isLoading,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
  selectedChatModel,
  setIsProcessingFile,
  isExistingChat = false,
}: MultimodalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [textareaHeight, setTextareaHeight] = useState(40);
  const pathname = usePathname();
  const isRootPath = pathname === '/';

  const [localStorageInput, setLocalStorageInput] = useLocalStorage("input", "");
  const [localStorageAttachments, setLocalStorageAttachments] = useLocalStorage<Array<CustomAttachment>>(
    `chat-${chatId}-attachments`,
    []
  );

  const { data: session } = useSession();
  const userEmail = session?.user?.email || undefined;

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      const finalValue = domValue || localStorageInput || "";
      setInput(finalValue);
    }
  }, [localStorageInput, setInput]);

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  // Initialize attachments from localStorage
  useEffect(() => {
    setAttachments(localStorageAttachments);
  }, [localStorageAttachments, setAttachments]);

  // Sync attachments with localStorage
  useEffect(() => {
    // Only update localStorage if attachments have changed
    if (!equal(attachments, localStorageAttachments)) {
      setLocalStorageAttachments(attachments);
    }
  }, [attachments, localStorageAttachments, setLocalStorageAttachments]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear attachments from localStorage when component unmounts
      // but only if we're not in the middle of a chat
      if (!isLoading && !isExistingChat) {
        setLocalStorageAttachments([]);
      }
    };
  }, [isLoading, isExistingChat, setLocalStorageAttachments]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const { uploadFile, isUploading, uploadProgress } = useDirectFileUpload({
    chatId,
    onUploadStart: () => {
      console.log("Upload started");
      setIsProcessingFile(true);
    },
    onUploadComplete: async (result) => {
      console.log("Upload complete", result);
      if (result.success && result.attachments) {
        const newAttachments = result.attachments || [];
        setAttachments((prev) => [...prev, ...newAttachments]);
        
        // Track file uploads for each attachment with user email
        for (const attachment of newAttachments) {
          if (attachment.contentType && attachment.size) {
            // Server-side tracking
            await trackFileUploaded(
              chatId,
              attachment.contentType,
              attachment.size,
              userEmail
            );
            
            // Client-side tracking
            trackClientFileUploaded(
              chatId,
              attachment.contentType,
              attachment.size,
              userEmail
            );
          }
        }
      }
      setIsProcessingFile(false);
      setUploadQueue((prev) => prev.slice(1));
    },
    onUploadError: (error) => {
      console.error("Upload error", error);
      setIsProcessingFile(false);
      setUploadQueue((prev) => prev.slice(1));
    },
    debug: false // Disable debug toasts
  });

  const handleAttachmentClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      
      // Process files sequentially to avoid overwhelming the server
      for (const file of files) {
        try {
          await uploadFile(file);
        } catch (error) {
          console.error(`Error uploading file: ${file.name}`, error);
          toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Reset the input value so the same file can be uploaded again if needed
      e.target.value = '';
    }
  }, [uploadFile]);

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      
      // Process files sequentially to avoid overwhelming the server
      for (const file of files) {
        try {
          await uploadFile(file);
        } catch (error) {
          console.error(`Error uploading file: ${file.name}`, error);
          toast.error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
  }, [uploadFile, setIsDragging]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFileDrop(e);
  }, [handleFileDrop]);

  const submitForm = useCallback(() => {
    window.history.replaceState({}, "", `/chat/${chatId}`);

    // Track the message being sent from the client side
    if (input.trim()) {
      trackClientMessageSent(chatId, input.trim().length, userEmail);
    }

    // Only process attachments that are currently in the state
    // This ensures removed attachments don't get included
    const currentAttachments = [...attachments];
    
    // Filter attachments to only use the extracted text for PDFs and text files
    const processedAttachments = currentAttachments.filter(attachment => {
      // Skip the raw PDF/text files, we'll use their extracted JSON instead
      if (attachment.associatedPdfName) {
        return false;
      }
      // Keep the extracted JSON and other supported file types
      return true;
    }).map(attachment => {
      // Ensure pdfUrl is included if it exists
      if (attachment.pdfUrl) {
        return {
          ...attachment,
          pdfUrl: attachment.pdfUrl
        };
      }
      return attachment;
    });

    handleSubmit(undefined, {
      experimental_attachments: processedAttachments,
    });

    // Clear attachments from both state and localStorage
    setAttachments([]);
    setLocalStorageAttachments([]);
    setLocalStorageInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [attachments, handleSubmit, setAttachments, setLocalStorageAttachments, setLocalStorageInput, width, chatId, input, userEmail]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedChatModel) {
      toast.error("Please select a chat model first");
      return;
    }
    setIsDragging(true);
  }, [selectedChatModel]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're leaving to a child element
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (
      x <= rect.left ||
      x >= rect.right ||
      y <= rect.top ||
      y >= rect.bottom
    ) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleRemoveAttachment = useCallback(async (attachmentToRemove: CustomAttachment) => {
    console.log("Removing attachment:", attachmentToRemove.name || attachmentToRemove.url);
    
    // Create a new array without the removed attachment
    const updatedAttachments = attachments.filter(
      (attachment) => attachment.url !== attachmentToRemove.url
    );
    
    // Also remove any associated JSON files that were extracted from this PDF
    // or any PDF files that this JSON was extracted from
    const fullyUpdatedAttachments = updatedAttachments.filter(attachment => {
      // Remove JSON files extracted from this PDF
      if (attachment.associatedPdfName === attachmentToRemove.name) {
        return false;
      }
      
      // Remove PDF files that this JSON was extracted from
      if (attachmentToRemove.associatedPdfName && 
          attachment.name === attachmentToRemove.associatedPdfName) {
        return false;
      }
      
      return true;
    });
    
    // Update both state and localStorage directly
    setAttachments(fullyUpdatedAttachments);
    setLocalStorageAttachments(fullyUpdatedAttachments);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    
    // If this is a PDF file that has been processed, we should also try to clean up the server-side
    if (attachmentToRemove.contentType === "application/pdf" || 
        (attachmentToRemove.contentType === "application/json" && attachmentToRemove.associatedPdfName)) {
      try {
        // Attempt to notify the server to clean up any processed files
        const blobName = attachmentToRemove.url?.split('/').pop()?.split('?')[0];
        if (blobName) {
          const response = await fetch('/api/files/cleanup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              blobName,
              chatId
            }),
          });
          
          if (!response.ok) {
            console.error("Failed to clean up processed files:", await response.text());
          }
        }
      } catch (error) {
        console.error("Error cleaning up processed files:", error);
      }
    }
    
    console.log("Attachment removed:", attachmentToRemove.name || attachmentToRemove.url);
  }, [attachments, setLocalStorageAttachments, chatId]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 &&
        !isLoading &&
        isRootPath && (
          <SuggestedActions append={append} chatId={chatId} />
        )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        accept="image/png,image/jpeg,image/webp,application/pdf"
        multiple
      />

      {(attachments.length > 0 || uploadQueue.length > 0 || Object.keys(uploadProgress).length > 0) && (
        <div className="flex flex-col gap-2">
          {/* Display files currently being uploaded with progress */}
          {Object.keys(uploadProgress).length > 0 && <UploadProgress uploadProgress={uploadProgress} />}
          
          {/* Display files in upload queue */}
          {uploadQueue.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-muted-foreground">
                Files in queue: {uploadQueue.length}
              </div>
              <div className="flex flex-wrap gap-2">
                {uploadQueue.map((filename) => (
                  <div
                    key={filename}
                    className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md text-xs"
                  >
                    <span className="truncate max-w-[150px]">{filename}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Display already uploaded attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <PreviewAttachment
                  key={`${attachment.url || attachment.name || index}`}
                  attachment={attachment}
                  onRemove={() => handleRemoveAttachment(attachment)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        className={cx(
          "flex items-end w-full px-4 py-2",
          "bg-background dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800",
          "shadow-sm transition-all duration-300 ease-in-out",
          "rounded-[var(--radius-lg)]",
          "relative overflow-hidden",
          "group/input",
          "hover:shadow-md hover:-translate-y-[1px]",
          "focus-within:shadow-lg focus-within:-translate-y-[2px] focus-within:border-zinc-300 dark:focus-within:border-zinc-700",
          isDragging && "ring-2 ring-blue-400/50",
          className,
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 m-[-2px] bg-gradient-to-br from-blue-100/90 to-blue-50/90 dark:from-blue-950/90 dark:to-blue-900/90 backdrop-blur-[2px] rounded-[var(--radius-lg)] border-2 border-dashed border-blue-400/50 dark:border-blue-400/30 z-50 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ 
                  scale: [0.95, 1.02, 0.95],
                  opacity: [0.9, 1, 0.9]
                }}
                transition={{ 
                  duration: 3,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                  times: [0, 0.5, 1]
                }}
                className="flex flex-col items-center gap-3 select-none pointer-events-none -mt-4"
              >
                <motion.div
                  animate={{
                    y: [-4, 4, -4],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                    times: [0, 0.5, 1]
                  }}
                  className="size-8 flex items-center justify-center"
                >
                  <div className="size-6 text-blue-500 dark:text-blue-400">
                    <svg 
                      className="size-6"
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8" 
                      />
                    </svg>
                  </div>
                </motion.div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg font-medium text-blue-600 dark:text-blue-300">
                    Drop files to upload
                  </span>
                  <span className="text-sm text-blue-500/80 dark:text-blue-300/80">
                    Release to add your files
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          className="flex w-full flex-col gap-2"
          animate={{
            height: isDragging ? "160px" : "auto",
          }}
          transition={{
            duration: 0.3,
            ease: "easeInOut"
          }}
        >
          <Textarea
            ref={textareaRef}
            placeholder="Send a message..."
            value={input}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() || attachments.length > 0) {
                  submitForm();
                }
              }
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              const newHeight = Math.min(target.scrollHeight, 200);
              target.style.height = `${newHeight}px`;
              setTextareaHeight(newHeight);
            }}
            rows={1}
            className="w-full min-h-[40px] max-h-[200px] resize-none border-none bg-transparent text-foreground placeholder:text-zinc-500 text-base pb-0 focus:ring-0 dark:focus:ring-0"
            style={{ 
              height: isDragging ? "120px" : "auto",
              transition: "height 0.3s ease-in-out"
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDragEnter(e);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDragLeave(e);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDrop(e);
            }}
          />

          <div className="flex w-full items-center justify-between">
            <div className="flex items-center">
              <AttachmentsButton
                className={cn(
                  "absolute bottom-1 left-1 z-10 sm:left-2"
                )}
                onClick={handleAttachmentClick}
                disabled={isLoading}
              >
                <PlusIcon size={16} />
              </AttachmentsButton>
            </div>

            <div className="flex items-center">
              {isLoading ? (
                <StopButton stop={stop} setMessages={setMessages} />
              ) : (
                <SendButton
                  input={input}
                  submitForm={submitForm}
                  uploadQueue={uploadQueue}
                />
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export const MultimodalInput = memo(PureMultimodalInput, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (!equal(prevProps.attachments, nextProps.attachments)) return false;
  return true;
});

function PureAttachmentsButton({
  className,
  onClick,
  disabled,
  children
}: {
  className?: string;
  onClick: () => void;
  disabled: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full p-0",
        "bg-background hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        "text-zinc-600 dark:text-zinc-400",
        "border border-zinc-200 dark:border-zinc-800",
        "transition-colors duration-200",
        "disabled:opacity-40 disabled:hover:bg-background dark:disabled:hover:bg-zinc-900",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children || <PlusIcon size={16} />}
    </button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: Dispatch<SetStateAction<Array<Message>>>;
}) {
  return (
    <Button
      size="icon"
      className={cx(
        "rounded-full w-8 h-8 p-0 flex items-center justify-center",
        "bg-background hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        "text-zinc-600 dark:text-zinc-400",
        "border border-zinc-200 dark:border-zinc-800",
        "transition-colors duration-200",
        "[&_svg]:size-4 [&_svg]:shrink-0"
      )}
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => sanitizeUIMessages(messages));
      }}
    >
      <StopIcon size={16} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

function PureSendButton({
  submitForm,
  input,
  uploadQueue,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
}) {
  return (
    <button
      onClick={submitForm}
      disabled={!input.trim() && uploadQueue.length === 0}
      className={cx(
        "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-accent",
        (!input.trim() && uploadQueue.length === 0) && "opacity-40"
      )}
      aria-label="Send message"
    >
      <ArrowUpIcon />
    </button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length) return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});