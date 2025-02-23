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

import { sanitizeUIMessages } from "@/lib/utils";
import equal from "fast-deep-equal";

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
}: MultimodalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [textareaHeight, setTextareaHeight] = useState(40);

  const [localStorageInput, setLocalStorageInput] = useLocalStorage("input", "");

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

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);
  const [isDragging, setIsDragging] = useState(false);

  const submitForm = useCallback(() => {
    window.history.replaceState({}, "", `/chat/${chatId}`);

    // Filter attachments to only use the extracted text for PDFs and text files
    const processedAttachments = attachments.filter(attachment => {
      // Skip the raw PDF/text files, we'll use their extracted JSON instead
      if (attachment.associatedPdfName) {
        return false;
      }
      // Keep the extracted JSON and other supported file types
      return true;
    });

    handleSubmit(undefined, {
      experimental_attachments: processedAttachments,
    });

    setAttachments([]);
    setLocalStorageInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [attachments, handleSubmit, setAttachments, setLocalStorageInput, width, chatId]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("chatId", chatId);

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const attachments = await response.json();
        // Return all attachments from the server (both PDF and extracted text)
        return attachments;
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (error) {
      toast.error("Failed to upload file, please try again!");
    }
  }, [chatId]);

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

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!selectedChatModel) {
      toast.error("Please select a chat model first");
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    
    try {
      // Validate all files first
      files.forEach(file => validateFileType(file, selectedChatModel));
      
      setUploadQueue(files.map((file) => file.name));
      setIsProcessingFile(true);

      const uploadPromises = files.map((file) => uploadFile(file));
      const uploadResults = await Promise.all(uploadPromises);
      const successfullyUploadedAttachments = uploadResults
        .filter(Boolean)
        .flat();

      setAttachments((currentAttachments) => [
        ...currentAttachments,
        ...successfullyUploadedAttachments,
      ]);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        console.error("Error uploading files!", error);
        toast.error("Failed to upload files!");
      }
    } finally {
      setUploadQueue([]);
      setIsProcessingFile(false);
    }
  }, [selectedChatModel, setAttachments, uploadFile, setIsProcessingFile]);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      
      try {
        // Validate all files first
        files.forEach(file => validateFileType(file, selectedChatModel));
        
        setUploadQueue(files.map((file) => file.name));
        setIsProcessingFile(true);

        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadResults = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadResults
          .filter(Boolean)
          .flat();

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        if (error instanceof Error) {
          toast.error(error.message);
        } else {
          console.error("Error uploading files!", error);
          toast.error("Failed to upload files!");
        }
      } finally {
        setUploadQueue([]);
        setIsProcessingFile(false);
      }
    },
    [selectedChatModel, setAttachments, uploadFile, setIsProcessingFile],
  );

  return (
    <div className="relative w-full flex flex-col gap-4">
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions append={append} chatId={chatId} />
        )}

      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex flex-wrap gap-2 items-start py-2 px-1">
          {attachments.map((attachment, index) => (
            <PreviewAttachment
              key={`${attachment.url || attachment.name || index}`}
              attachment={attachment}
              onRemove={() => {
                setAttachments((currentAttachments) =>
                  currentAttachments.filter((a) => a.url !== attachment.url),
                );
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
            />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={`uploading-${filename}`}
              attachment={{
                url: "",
                name: filename,
                contentType: "",
              }}
              isUploading={true}
            />
          ))}
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
              className="absolute inset-0 m-[-2px] bg-gradient-to-br from-blue-950/90 to-blue-900/90 backdrop-blur-[2px] rounded-[var(--radius-lg)] border-2 border-dashed border-blue-400/50 z-50 flex items-center justify-center"
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
                  <span className="text-lg font-medium text-blue-600 dark:text-blue-400">
                    Drop files to upload
                  </span>
                  <span className="text-sm text-blue-500/80 dark:text-blue-400/80">
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
                fileInputRef={fileInputRef}
                isLoading={isLoading}
                selectedChatModel={selectedChatModel}
              />
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
  fileInputRef,
  isLoading,
  selectedChatModel,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  isLoading: boolean;
  selectedChatModel: string;
}) {
  const isGPT4oMini = selectedChatModel === "chat-model-small";

  return (
    <button
      type="button"
      className={cx(
        "flex items-center justify-center w-8 h-8 rounded-full",
        "border border-zinc-200 dark:border-zinc-800",
        "bg-background hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        "text-zinc-600 dark:text-zinc-400",
        "transition-colors duration-200"
      )}
      onClick={(event) => {
        event.preventDefault();
        if (!selectedChatModel) {
          toast.error("Please select a chat model first");
          return;
        }
        fileInputRef.current?.click();
      }}
      disabled={isLoading}
    >
      <PlusIcon size={16} />
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
      className={cx(
        "rounded-full w-8 h-8 flex items-center justify-center",
        "bg-background hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        "text-zinc-600 dark:text-zinc-400",
        "border border-zinc-200 dark:border-zinc-800",
        "transition-colors duration-200"
      )}
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => sanitizeUIMessages(messages));
      }}
    >
      <StopIcon size={14} />
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
    <Button
      className={cx(
        "rounded-full w-8 h-8 flex items-center justify-center",
        "bg-background hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        "text-zinc-600 dark:text-zinc-400",
        "border border-zinc-200 dark:border-zinc-800",
        "transition-colors duration-200",
        "disabled:opacity-40 disabled:hover:bg-background dark:disabled:hover:bg-zinc-900"
      )}
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0 || uploadQueue.length > 0}
    >
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length) return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});