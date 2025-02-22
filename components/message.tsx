"use client";

import type { ChatRequestOptions, Message } from "ai";
import cx from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useState, useEffect, useMemo, useRef } from "react";
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

function extractTextFromContent(content: any): string {
  // If content is a string, try to parse it as JSON first
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return extractTextFromContent(parsed);
    } catch {
      return content;
    }
  }

  // Handle array content
  if (Array.isArray(content)) {
    return content.map(item => extractTextFromContent(item)).join('\n');
  }

  // Handle object content
  if (typeof content === 'object' && content !== null) {
    // If this is a document object or has a document type, return empty string
    if (content.type === 'document' || content.kind === 'document') {
      return '';
    }
    // If content has a text property, use that
    if ('text' in content) {
      return content.text;
    }
    // If content has a content property, extract from that
    if ('content' in content) {
      return extractTextFromContent(content.content);
    }
    // If content has a result property, extract from that
    if ('result' in content) {
      return extractTextFromContent(content.result);
    }
  }

  // Fallback to string conversion
  return String(content || '');
}

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
  const originalMessageId = useRef(message.id);

  // Use the original message ID for tool invocations to maintain stability
  const messageWithStableId = useMemo(() => ({
    ...message,
    id: originalMessageId.current
  }), [message]);

  // Memoize the document tool invocation to prevent unnecessary recalculations
  const documentToolInvocation = useMemo(() => {
    const toolInvocations = messageWithStableId.toolInvocations || [];
    return toolInvocations.find(
      (t) => t.toolName === "createDocument" && t.state === "result"
    ) as
      | (typeof toolInvocations[0] & { state: "result"; result: any })
      | undefined;
  }, [messageWithStableId.toolInvocations]);

  useEffect(() => {
    if (documentToolInvocation) {
      debug("message", "Initializing document state", {
        messageId: messageWithStableId.id,
        toolCallId: documentToolInvocation.toolCallId,
        documentId: documentToolInvocation.result.id,
        currentBlockId: block.documentId,
        isFirstInitialization: !isDocumentInitialized
      });

      // Use a function to update block state to ensure we have latest values
      setBlock((currentBlock: UIBlock) => {
        // Always update on document tool invocation to ensure proper initialization
        debug("message", "Updating block state with document", {
          fromBlockId: currentBlock.documentId,
          toDocumentId: documentToolInvocation.result.id,
          isNewDocument: currentBlock.documentId === "init",
          hasContentChange: currentBlock.content !== (documentToolInvocation.result.content || "")
        });

        const updatedBlock = {
          ...currentBlock,
          documentId: documentToolInvocation.result.id,
          title: documentToolInvocation.result.title,
          kind: documentToolInvocation.result.kind,
          status: "idle",
          isVisible: true,
          content: documentToolInvocation.result.content || "",
          boundingBox: {
            top: 0,
            left: 0,
            width: 0,
            height: 0
          }
        };

        // Only mark as initialized after successful update
        if (!isDocumentInitialized) {
          setTimeout(() => setIsDocumentInitialized(true), 0);
        }

        return updatedBlock;
      });
    }
  }, [documentToolInvocation, messageWithStableId.id, setBlock, block.documentId, isDocumentInitialized]);

  useEffect(() => {
    debug('message', 'Message rendered', {
      messageId: messageWithStableId.id,
      role: messageWithStableId.role,
      content: typeof messageWithStableId.content === 'string' ? messageWithStableId.content?.substring(0, 100) + '...' : JSON.stringify(messageWithStableId.content)?.substring(0, 100) + '...',
      hasToolInvocations: !!messageWithStableId.toolInvocations?.length,
      toolInvocations: messageWithStableId.toolInvocations?.map(t => ({
        state: t.state,
        toolName: t.toolName,
        toolCallId: t.toolCallId
      })),
      isLoading
    });
  }, [messageWithStableId, isLoading]);

  // Check if there's no content to display
  if (!messageWithStableId.content && !messageWithStableId.toolInvocations?.length) {
    // No textual content but no other reason to render? Possibly show no UI.
    return null;
  }

  // Skip rendering if this is a document creation message
  if (documentToolInvocation) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={messageWithStableId.role}
        data-message-id={messageWithStableId.id}
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
          {messageWithStableId.role === "assistant" && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {messageWithStableId.reasoning && (
              <MessageReasoning isLoading={isLoading} reasoning={messageWithStableId.reasoning} />
            )}

            {/* Handle document creation tool invocation */}
            {documentToolInvocation && (
              <DocumentPreview
                isReadonly={isReadonly}
                result={documentToolInvocation.result}
                isCompact={block.isVisible}
              />
            )}

            {/* Only show content if not a document creation message */}
            {!documentToolInvocation && messageWithStableId.content && mode === "view" && (
              <div className="flex flex-row gap-2 items-start">
                {messageWithStableId.role === "user" && !isReadonly && (
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
                  className={cn("flex flex-col gap-0", {
                    "bg-primary text-primary-foreground dark:bg-primary dark:text-primary-foreground px-4 py-2.5 rounded-[var(--radius-lg)] [&_*]:!text-primary-foreground dark:[&_*]:!text-primary-foreground":
                      messageWithStableId.role === "user"
                  })}
                >
                  <div className="!mb-0">
                    <Markdown className="[&_*]:!text-inherit [&_p]:!m-0 [&>*:last-child]:!mb-0 [&>*:first-child]:!mt-0 [&_p]:!mb-0">
                      {(() => {
                        const content = messageWithStableId.content;
                        
                        // If content is already a string, try to parse it as JSON
                        if (typeof content === 'string') {
                          try {
                            const parsed = JSON.parse(content);
                            return extractTextFromContent(parsed);
                          } catch {
                            return content;
                          }
                        }
                        
                        // If content is an object, try to extract text directly
                        if (typeof content === 'object' && content !== null) {
                          return extractTextFromContent(content);
                        }
                        
                        // Fallback to string conversion
                        return String(content || '');
                      })()}
                    </Markdown>
                  </div>
                </div>
              </div>
            )}

            {messageWithStableId.content && mode === "edit" && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={messageWithStableId.id}
                  message={messageWithStableId}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {/* Handle other tool invocations */}
            {(messageWithStableId.toolInvocations || [])
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
                key={`action-${messageWithStableId.id}`}
                chatId={chatId}
                message={messageWithStableId}
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
  
  // Re-render if tool invocations change
  if (!equal(prevProps.message.toolInvocations, nextProps.message.toolInvocations)) return false;
  
  // Re-render if vote changes
  if (!equal(prevProps.vote, nextProps.vote)) return false;

  // Otherwise, prevent re-render
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