"use client";

import type { ChatRequestOptions, Message } from "ai";
import cx from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useState, useEffect, useMemo } from "react";
import type { Vote } from "@/lib/db/schema";
import { DocumentToolCall, DocumentToolResult } from "./document";
import { PencilEditIcon, SparklesIcon } from "./icons";
import { Markdown } from "./markdown";
import { MessageActions } from "./message-actions";
import { PreviewAttachment } from "./preview-attachment";
import { Weather } from "./weather";
import equal from "fast-deep-equal";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { MessageEditor } from "./message-editor";
import { DocumentPreview } from "./document-preview";
import { MessageReasoning } from "./message-reasoning";
import { debug } from "@/lib/utils/debug";
import { useBlock } from "@/hooks/use-block";
import type { UIBlock } from "./block";

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
}: {
  chatId: string;
  message: Message;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[])
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const { block, setBlock } = useBlock();
  const [isDocumentInitialized, setIsDocumentInitialized] = useState(false);

  // Memoize the document tool invocation to prevent unnecessary recalculations
  const documentToolInvocation = useMemo(() => {
    const toolInvocations = message.toolInvocations || [];
    return toolInvocations.find(
      (t) => t.toolName === "createDocument" && t.state === "result"
    ) as
      | (typeof toolInvocations[0] & { state: "result"; result: any })
      | undefined;
  }, [message.toolInvocations]);

  debug("message", "Processing message for render", {
    messageId: message.id,
    role: message.role,
    contentPreview:
      typeof message.content === "string"
        ? message.content.substring(0, 100) + "..."
        : JSON.stringify(message.content).substring(0, 100) + "...",
    hasToolInvocations: !!message.toolInvocations?.length,
    toolInvocations: message.toolInvocations || [],
    isDocumentInitialized,
    blockDocumentId: block.documentId
  });

  // Skip empty messages
  if (
    !message.content &&
    (!message.toolInvocations || message.toolInvocations.length === 0) &&
    message.role === "assistant" &&
    !isLoading
  ) {
    return null;
  }

  // If the message has attachments or tool invocations describing documents, show them.
  if (!message.content && message.toolInvocations?.length === 0 && message.role === "assistant" && !isLoading) {
    // No textual content but no other reason to render? Possibly show no UI.
    return null;
  }

  useEffect(() => {
    if (documentToolInvocation && !isDocumentInitialized) {
      debug("message", "Initializing document state", {
        messageId: message.id,
        toolCallId: documentToolInvocation.toolCallId,
        documentId: documentToolInvocation.result.id,
        currentBlockId: block.documentId,
        isFirstInitialization: !isDocumentInitialized
      });

      setBlock((block: UIBlock) => {
        // Only update if this is a new document or we haven't initialized yet
        if (block.documentId === "init" || block.documentId !== documentToolInvocation.result.id) {
          debug("message", "Updating block state with document", {
            fromBlockId: block.documentId,
            toDocumentId: documentToolInvocation.result.id
          });

          return {
            ...block,
            documentId: documentToolInvocation.result.id,
            title: documentToolInvocation.result.title,
            kind: documentToolInvocation.result.kind,
            status: "idle",
            isVisible: false,
            content: documentToolInvocation.result.content || "",
            boundingBox: {
              top: 0,
              left: 0,
              width: 0,
              height: 0
            }
          };
        }
        return block;
      });

      setIsDocumentInitialized(true);
    }
  }, [documentToolInvocation?.result?.id, message.id, setBlock, block.documentId, isDocumentInitialized]);

  // If this is a document message but we're still loading the document content,
  // show a loading state instead of the placeholder text
  if (documentToolInvocation && !isDocumentInitialized) {
    return (
      <motion.div 
        className="w-full mx-auto max-w-3xl px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex gap-4 items-center">
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background animate-pulse" />
          <div className="h-[57px] w-full bg-muted rounded-xl animate-pulse" />
        </div>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            "flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl",
            {
              "w-full": mode === "edit",
              "group-data-[role=user]/message:w-fit": mode !== "edit"
            }
          )}
        >
          {message.role === "assistant" && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {message.experimental_attachments && (
              <div className="flex flex-row justify-end gap-2">
                {message.experimental_attachments.map((attachment) => (
                  <PreviewAttachment key={attachment.url} attachment={attachment} />
                ))}
              </div>
            )}

            {message.reasoning && (
              <MessageReasoning isLoading={isLoading} reasoning={message.reasoning} />
            )}

            {/* Handle document creation tool invocation */}
            {documentToolInvocation && (
              <DocumentPreview
                isReadonly={isReadonly}
                result={documentToolInvocation.result}
              />
            )}

            {/* Only show content if not a document creation message */}
            {!documentToolInvocation && message.content && mode === "view" && (
              <div className="flex flex-row gap-2 items-start">
                {message.role === "user" && !isReadonly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                        onClick={() => {
                          setMode("edit");
                        }}
                      >
                        <PencilEditIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit message</TooltipContent>
                  </Tooltip>
                )}

                <div
                  className={cn("flex flex-col gap-4", {
                    "bg-primary text-primary-foreground px-3 py-2 rounded-[var(--radius-lg)]":
                      message.role === "user"
                  })}
                >
                  <Markdown>{message.content}</Markdown>
                </div>
              </div>
            )}

            {message.content && mode === "edit" && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={message.id}
                  message={message}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {/* Handle other tool invocations */}
            {(message.toolInvocations || [])
              .filter((t) => t.toolName !== "createDocument")
              .map((toolInvocation) => {
                const { toolName, toolCallId, state, args } = toolInvocation;

                if (state === "result") {
                  const { result } = toolInvocation;

                  return (
                    <div key={toolCallId}>
                      {toolName === "getWeather" ? (
                        <Weather weatherAtLocation={result} />
                      ) : toolName === "updateDocument" ? (
                        <DocumentToolResult
                          type="update"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === "requestSuggestions" ? (
                        <DocumentToolResult
                          type="request-suggestions"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : (
                        <pre>{JSON.stringify(result, null, 2)}</pre>
                      )}
                    </div>
                  );
                }
                return (
                  <div
                    key={toolCallId}
                    className={cx({
                      skeleton: ["getWeather"].includes(toolName)
                    })}
                  >
                    {toolName === "getWeather" ? (
                      <Weather />
                    ) : toolName === "updateDocument" ? (
                      <DocumentToolCall
                        type="update"
                        args={args}
                        isReadonly={isReadonly}
                      />
                    ) : toolName === "requestSuggestions" ? (
                      <DocumentToolCall
                        type="request-suggestions"
                        args={args}
                        isReadonly={isReadonly}
                      />
                    ) : null}
                  </div>
                );
              })}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(PurePreviewMessage, (prevProps, nextProps) => {
  // Only re-render if loading state changes
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  
  // Re-render if message content changes
  if (prevProps.message.content !== nextProps.message.content) return false;
  
  // Re-render if message reasoning changes
  if (prevProps.message.reasoning !== nextProps.message.reasoning) return false;
  
  // Re-render if tool invocations change, but only if they're different
  if (prevProps.message.toolInvocations || nextProps.message.toolInvocations) {
    if (!equal(prevProps.message.toolInvocations, nextProps.message.toolInvocations)) {
      return false;
    }
  }
  
  // Re-render if vote changes
  if (!equal(prevProps.vote, nextProps.vote)) return false;
  
  // Re-render if readonly state changes
  if (prevProps.isReadonly !== nextProps.isReadonly) return false;

  // No relevant changes, prevent re-render
  return true;
});

export const ThinkingMessage = () => {
  const role = "assistant";

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          "flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-[var(--radius-lg)]",
          {
            "group-data-[role=user]/message:bg-muted": true
          }
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Thinking...
          </div>
        </div>
      </div>
    </motion.div>
  );
};