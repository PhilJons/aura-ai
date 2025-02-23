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
import type { UIBlock, BlockKind } from "./block";
import { PreviewAttachment } from './preview-attachment';

interface DocumentToolInvocation {
  toolName: string;
  toolCallId: string;
  state: "result";
  result: { id: string; title: string; kind: BlockKind; content?: string };
}

interface ToolInvocationBase {
  toolName: string;
  toolCallId: string;
  args: any;
}

interface ToolInvocationCall extends ToolInvocationBase {
  state: 'call';
}

interface ToolInvocationResult extends ToolInvocationBase {
  state: 'result';
  result: { id: string; title: string; kind: BlockKind; content?: string };
}

type ToolInvocation = ToolInvocationCall | ToolInvocationResult;

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
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const { block, setBlock } = useBlock();
  const [isDocumentInitialized, setIsDocumentInitialized] = useState(false);
  const originalMessageId = useRef(message.id);

  // Use the original message ID for tool invocations to maintain stability
  const messageWithStableId = useMemo(() => ({
    ...message,
    id: originalMessageId.current,
    chatId
  }), [message, chatId]);

  // Memoize the document tool invocation to prevent unnecessary recalculations
  const documentToolInvocation = useMemo(() => {
    const toolInvocations = messageWithStableId.toolInvocations || [];
    return toolInvocations.find(
      (t) => t.toolName === "createDocument" && t.state === "result"
    ) as ToolInvocationResult | undefined;
  }, [messageWithStableId.toolInvocations]);

  // Only show document preview if we have a valid result
  const documentPreviewResult = useMemo(() => {
    if (!documentToolInvocation || documentToolInvocation.state !== "result") {
      return undefined;
    }
    return documentToolInvocation.result;
  }, [documentToolInvocation]);

  useEffect(() => {
    if (documentToolInvocation && documentPreviewResult) {
      debug("message", "Initializing document state", {
        messageId: messageWithStableId.id,
        toolCallId: documentToolInvocation.toolCallId,
        documentId: documentPreviewResult.id,
        currentBlockId: block.documentId,
        isFirstInitialization: !isDocumentInitialized
      });

      // Use a function to update block state to ensure we have latest values
      setBlock((currentBlock: UIBlock) => {
        // Always update on document tool invocation to ensure proper initialization
        debug("message", "Updating block state with document", {
          fromBlockId: currentBlock.documentId,
          toDocumentId: documentPreviewResult.id,
          isNewDocument: currentBlock.documentId === "init",
          hasContentChange: currentBlock.content !== (documentPreviewResult.content || "")
        });

        const updatedBlock = {
          ...currentBlock,
          documentId: documentPreviewResult.id,
          title: documentPreviewResult.title,
          kind: documentPreviewResult.kind,
          status: "idle" as const,
          isVisible: true,
          content: documentPreviewResult.content || "",
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
  }, [documentToolInvocation, documentPreviewResult, messageWithStableId.id, setBlock, block.documentId, isDocumentInitialized]);

  useEffect(() => {
    debug('message', 'Message rendered', {
      messageId: messageWithStableId.id,
      role: messageWithStableId.role,
      content: typeof messageWithStableId.content === 'string' ? `${messageWithStableId.content?.substring(0, 100)}...` : `${JSON.stringify(messageWithStableId.content)?.substring(0, 100)}...`,
      hasToolInvocations: !!messageWithStableId.toolInvocations?.length,
      toolInvocations: messageWithStableId.toolInvocations?.map(t => ({
        state: t.state,
        toolName: t.toolName,
        toolCallId: t.toolCallId
      })),
      isLoading
    });
  }, [messageWithStableId, isLoading]);

  if (!messageWithStableId.content && messageWithStableId.role === 'assistant' && !isLoading) {
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
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {messageWithStableId.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full">
            {messageWithStableId.experimental_attachments && (
              <div className="flex flex-row justify-end gap-2">
                {messageWithStableId.experimental_attachments.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}

            {messageWithStableId.reasoning && (
              <MessageReasoning
                isLoading={isLoading}
                reasoning={messageWithStableId.reasoning}
              />
            )}

            {(messageWithStableId.content || messageWithStableId.reasoning) && mode === 'view' && (
              <div className="flex flex-row gap-2 items-start">
                {messageWithStableId.role === 'user' && !isReadonly && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                        onClick={() => {
                          setMode('edit');
                        }}
                      >
                        <PencilEditIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit message</TooltipContent>
                  </Tooltip>
                )}

                <div
                  className={cn('flex flex-col gap-4', {
                    'bg-primary text-primary-foreground px-3 py-2 rounded-xl [&_.prose]:text-primary-foreground [&_.prose_*]:text-primary-foreground':
                      messageWithStableId.role === 'user',
                  })}
                >
                  <Markdown>{messageWithStableId.content as string}</Markdown>
                </div>
              </div>
            )}

            {messageWithStableId.content && mode === 'edit' && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={messageWithStableId.id}
                  message={{ ...messageWithStableId, chatId }}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {messageWithStableId.toolInvocations && messageWithStableId.toolInvocations.length > 0 && (
              <div className="flex flex-col gap-4">
                {messageWithStableId.toolInvocations.map((toolInvocation) => {
                  const { toolName, toolCallId, state, args } = toolInvocation;

                  if (state === 'result') {
                    const { result } = toolInvocation;

                    return (
                      <div key={toolCallId}>
                        {toolName === 'getWeather' ? (
                          <Weather weatherAtLocation={result} />
                        ) : toolName === 'createDocument' ? (
                          <DocumentPreview
                            isReadonly={isReadonly}
                            result={result}
                          />
                        ) : toolName === 'updateDocument' ? (
                          <DocumentToolResult
                            type="update"
                            result={result}
                            isReadonly={isReadonly}
                          />
                        ) : toolName === 'requestSuggestions' ? (
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
                        skeleton: ['getWeather'].includes(toolName),
                      })}
                    >
                      {toolName === 'getWeather' ? (
                        <Weather />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview isReadonly={isReadonly} args={args} />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolCall
                          type="update"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolCall
                          type="request-suggestions"
                          args={args}
                          isReadonly={isReadonly}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

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