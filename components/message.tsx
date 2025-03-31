"use client";

import type { ChatRequestOptions, Message, } from "ai";
import cx from "classnames";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useState, useEffect, useMemo, useRef } from "react";
import type { Vote } from "@/lib/db/schema";
import { DocumentToolCall, DocumentToolResult } from "./document";
import { PencilEditIcon, SparklesIcon } from "./icons";
import { Globe, ChevronDown, } from "lucide-react";
import { MessageActions } from "./message-actions";
// Removed import { Weather } from "./weather";
import equal from "fast-deep-equal";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { MessageEditor } from "./message-editor";
// import { DocumentPreview } from "./document-preview";
import { MessageReasoning } from "./message-reasoning";
import { debug } from "@/lib/utils/debug";
import { PreviewAttachment } from './preview-attachment';
import { SearchResults } from './search-results';
import type { SearchResultItem } from '@/lib/ai/tools/search';
import { StreamingMarkdown } from "./streaming-markdown";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";

interface DocumentToolInvocation {
  toolName: string;
  toolCallId: string;
  state: "result";
  result: { id: string; title: string; kind: string; content?: string };
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
  result: any;
}

type ExtendedToolInvocation = ToolInvocationCall | ToolInvocationResult;

// Add this interface for search results that includes searchQuery
interface ExtendedSearchResultItem {
  title: string;
  url: string;
  content: string;
  searchQuery?: string;
}

function extractTextFromContent(content: any): string {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(item => item?.type === 'text' ? item.text : '') // Only extract text parts
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object' && content !== null) {
    if (content.type === 'document' || content.kind === 'document') return '';
    if ('text' in content) return String(content.text || '');
    if ('content' in content) return extractTextFromContent(content.content);
    if ('result' in content) return extractTextFromContent(content.result);
  }
  return String(content || '');
}

function extractSearchResults(data: any): SearchResultItem[] {
  try {
    if (!data) return [];
    if (Array.isArray(data)) return data as SearchResultItem[]; // Direct array
    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data.results)) return data.results as SearchResultItem[]; // Object with results array
    }
    if (typeof data === 'string') { // JSON string
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed as SearchResultItem[];
      if (parsed && Array.isArray(parsed.results)) return parsed.results as SearchResultItem[];
    }
  } catch (e) {
    console.error("Failed to parse search data", e);
  }
  return []; // Default empty
}

function extractSearchQuery(data: any, args?: any): string {
   try {
    if (data && typeof data === 'object') {
      if (typeof data.query === 'string') return data.query;
      if (data.args && typeof data.args === 'object' && typeof data.args.query === 'string') return data.args.query;
    }
    // Fallback to args if provided
    if (args && typeof args === 'object' && typeof args.query === 'string') {
      return args.query;
    }
    // Try parsing if data is a string
    if (typeof data === 'string') {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed.query === 'string') return parsed.query;
      if (parsed?.args && typeof parsed.args.query === 'string') return parsed.args.query;
    }
  } catch (e) {
     console.error("Failed to parse search query", e);
  }
  return ""; // Default empty
}

// Safe function to get hostname from URL
function getHostname(url: string): string {
  if (!url || url === '#' || url === 'about:blank') return '';
  
  try {
    // If URL doesn't start with http:// or https://, add https://
    let urlToProcess = url;
    if (!/^https?:\/\//i.test(urlToProcess)) {
      urlToProcess = `https://${urlToProcess}`;
    }
    
    return new URL(urlToProcess).hostname;
  } catch (e) {
    // Don't log errors during render
    return '';
  }
}

// Display URL name function
function displayUrlName(url: string): string {
  if (!url || url === '#' || url === 'about:blank') return 'No source';
  
  try {
    // If URL doesn't start with http:// or https://, add https://
    let urlToProcess = url;
    if (!/^https?:\/\//i.test(urlToProcess)) {
      urlToProcess = `https://${urlToProcess}`;
    }
    
    const hostname = new URL(urlToProcess).hostname;
    const parts = hostname.split('.');
    return parts.length > 2 ? parts.slice(1, -1).join('.') : parts[0];
  } catch (e) {
    // Don't log errors during render
    return 'Unknown source';
  }
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
  const originalMessageId = useRef(message.id);
  
  // Track open/closed state for each search invocation - initialize 'search-group' to false to start collapsed
  const [collapsibleStates, setCollapsibleStates] = useState<Record<string, boolean>>({
    'search-group': false // Start collapsed by default
  });

  // Memoize stable message ID
  const messageWithStableId = useMemo(() => ({
    ...message,
    id: originalMessageId.current,
    chatId
  }), [message, chatId]);

  useEffect(() => {
    debug('message', 'PreviewMessage rendered', {
      messageId: messageWithStableId.id,
      role: messageWithStableId.role,
      contentLength: typeof messageWithStableId.content === 'string' ? messageWithStableId.content.length : -1,
      hasToolInvocations: !!messageWithStableId.toolInvocations?.length,
      isLoadingProp: isLoading
    });
  }, [messageWithStableId, isLoading]);

  const mainContent = useMemo(() => extractTextFromContent(messageWithStableId.content), [messageWithStableId.content]);
  const searchInvocations = useMemo(() =>
    (messageWithStableId.toolInvocations as ExtendedToolInvocation[])?.filter(t => t?.toolName === 'search') || [],
    [messageWithStableId.toolInvocations]
  );
  const otherToolInvocations = useMemo(() =>
    (messageWithStableId.toolInvocations as ExtendedToolInvocation[])?.filter(t => t?.toolName !== 'search') || [],
    [messageWithStableId.toolInvocations]
  );

  if (messageWithStableId.role === 'assistant' && !mainContent && searchInvocations.length === 0 && otherToolInvocations.length === 0 && !isLoading) {
     return null;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={messageWithStableId.id}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0, x: -5 }}
        animate={{ y: 0, opacity: 1, x: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        style={{ direction: 'ltr' }}
        data-role={messageWithStableId.role}
        data-message-id={messageWithStableId.id}
      >
        <div
          className={cn(
            'flex gap-4 w-full',
            messageWithStableId.role === 'user' && 'group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
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
              <div className={cn(
                "flex flex-col gap-2 mb-2",
                messageWithStableId.role === 'user' 
                  ? "items-end self-end max-w-[300px]" 
                  : "items-start w-full"
              )}>
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
                isLoading={messageWithStableId.role === 'assistant' ? isLoading : false}
                reasoning={messageWithStableId.reasoning}
              />
            )}

            {/* Search invocations (moved above main content) */}
            {searchInvocations.length > 0 && (
              <div className="flex flex-col gap-4">
                <div className="max-w-2xl mx-auto w-full">
                  <div className="flex gap-3">
                    <div className="relative flex flex-col items-center">
                      <div className="mt-4 w-5">
                        <Globe size={20} className="text-muted-foreground" />
                      </div>
                    </div>
                    
                    <div className="flex-1 rounded-2xl p-4 border border-border/50">
                      {/* Custom collapsible component */}
                      <div className="w-full">
                        {/* Header with trigger */}
                        <button 
                          type="button"
                          onClick={() => {
                            setCollapsibleStates(prev => ({
                              ...prev,
                              'search-group': !prev['search-group']
                            }));
                          }}
                          className="flex items-center justify-between w-full group"
                        >
                          <div className="flex items-center justify-between w-full gap-2">
                            <div className="text-sm w-full">
                              <div className="flex justify-between items-center w-full">
                                <span className="font-medium">Search Results</span>
                                <span className="text-xs text-muted-foreground">
                                  ({searchInvocations.length} {searchInvocations.length === 1 ? 'search' : 'searches'})
                                </span>
                              </div>
                            </div>
                            <ChevronDown 
                              className={cn(
                                "size-4 text-muted-foreground transition-transform duration-200",
                                collapsibleStates['search-group'] && "rotate-180"
                              )} 
                            />
                          </div>
                        </button>
                        
                        {/* Content */}
                        {!collapsibleStates['search-group'] ? (
                          // Show collapsed preview content
                          <>
                            <div className="my-4 border-t border-border/50" />
                            {/* Query tags */}
                            <div className="flex flex-wrap gap-2 mb-3">
                              {(() => {
                                // Get all queries
                                const allQueries = searchInvocations.map(invocation => {
                                  const { state, args } = invocation;
                                  const isSearchLoading = state === 'call';
                                  const result = isSearchLoading ? null : (invocation as ToolInvocationResult).result;
                                  return extractSearchQuery(isSearchLoading ? args : result, args);
                                }).filter(Boolean);
                                
                                return allQueries.map((query, index) => (
                                  <span 
                                    key={`search-query-${query || 'empty'}-${index}`}
                                    className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted"
                                  >
                                    {query}
                                  </span>
                                ));
                              })()}
                            </div>

                            {/* Preview of top result from each search */}
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              {(() => {
                                // Get a preview of results
                                const previewResults = searchInvocations.reduce((acc, invocation) => {
                                  const { state, args } = invocation;
                                  if (state === 'result') {
                                    const result = (invocation as ToolInvocationResult).result;
                                    const query = extractSearchQuery(result, args);
                                    const results = extractSearchResults(result);
                                    
                                    // Take the first result from each search query if available
                                    if (results.length > 0) {
                                      acc.push({
                                        ...results[0],
                                        searchQuery: query || 'Search'
                                      } as ExtendedSearchResultItem);
                                    }
                                  }
                                  return acc;
                                }, [] as ExtendedSearchResultItem[]);
                                
                                // Count total results across all searches
                                const totalResultsCount = searchInvocations.reduce((total, invocation) => {
                                  if (invocation.state === 'result') {
                                    const results = extractSearchResults((invocation as ToolInvocationResult).result);
                                    return total + results.length;
                                  }
                                  return total;
                                }, 0);
                                
                                return (
                                  <>
                                    {/* First result */}
                                    {previewResults.length > 0 && (
                                      <div>
                                        <Link 
                                          href={previewResults[0].url} 
                                          passHref 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="block h-full"
                                        >
                                          <div className="border rounded-md p-2 size-full hover:bg-muted/50 transition-colors flex flex-col">
                                            <p className="text-xs line-clamp-2 font-medium text-blue-600 dark:text-blue-400 mb-auto">
                                              {previewResults[0].title || previewResults[0].content}
                                            </p>
                                            <div className="mt-1 flex items-center space-x-1">
                                              <Avatar className="size-3 shrink-0">
                                                <AvatarImage
                                                  src={`https://www.google.com/s2/favicons?domain=${getHostname(previewResults[0].url)}`}
                                                  alt={getHostname(previewResults[0].url)}
                                                />
                                                <AvatarFallback className="text-[6px]">
                                                  {getHostname(previewResults[0].url)[0]?.toUpperCase() || '?'}
                                                </AvatarFallback>
                                              </Avatar>
                                              <div className="text-[10px] text-muted-foreground truncate text-left">
                                                {displayUrlName ? displayUrlName(previewResults[0].url) : getHostname(previewResults[0].url)}
                                              </div>
                                            </div>
                                          </div>
                                        </Link>
                                      </div>
                                    )}
                                    
                                    {/* "+X more" counter box */}
                                    {totalResultsCount > 1 && (
                                      <div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCollapsibleStates(prev => ({
                                              ...prev,
                                              'search-group': true
                                            }));
                                          }}
                                          className="size-full border rounded-md p-2 flex flex-col items-center justify-center bg-muted/20 hover:bg-muted/30 transition-colors"
                                        >
                                          <span className="text-sm font-medium text-muted-foreground">+{totalResultsCount - 1}</span>
                                          <span className="text-xs text-muted-foreground">
                                            more {totalResultsCount - 1 === 1 ? 'result' : 'results'}
                                          </span>
                                        </button>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </>
                        ) : (
                          // Show expanded full results
                          <>
                            <div className="my-4 border-t border-border/50" />
                            {(() => {
                              const allSearches = searchInvocations.map(invocation => {
                                const { toolCallId, state, args } = invocation;
                                const isSearchLoading = state === 'call';
                                const result = isSearchLoading ? null : (invocation as ToolInvocationResult).result;
                                const query = extractSearchQuery(isSearchLoading ? args : result, args);
                                const results = extractSearchResults(isSearchLoading ? [] : result);
                                
                                return {
                                  toolCallId,
                                  query,
                                  results,
                                  isLoading: isSearchLoading
                                };
                              });
                              
                              const isAnySearchLoading = allSearches.some(search => search.isLoading);
                              
                              const allQueries = allSearches
                                .map(search => search.query)
                                .filter(Boolean);
                              
                              const allResults = allSearches
                                .flatMap(search => 
                                  search.results.map(result => ({
                                    ...result,
                                    searchQuery: search.query
                                  }))
                                );
                              
                              return (
                                <div>
                                  <SearchResults
                                    results={allResults}
                                    query={allQueries.join(', ')}
                                    isLoading={isAnySearchLoading}
                                    isConsolidated={true}
                                  />
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Text Content (moved after search invocations) */}
            {(mainContent || (messageWithStableId.role === 'assistant' && isLoading)) && mode === 'view' && (
              <div className={cn(
                "flex flex-row gap-2 items-start",
                messageWithStableId.role === 'user' && messageWithStableId.experimental_attachments?.length 
                  ? "self-end max-w-[300px]" 
                  : ""
              )}>
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
                  <StreamingMarkdown 
                    content={mainContent} 
                    messageId={messageWithStableId.id}
                  />
                </div>
              </div>
            )}

            {messageWithStableId.content && mode === 'edit' && (
              <div className="flex flex-row gap-2 items-start">
                <div className="size-8" />

                <MessageEditor
                  key={`editor-${messageWithStableId.id}`}
                  message={{ ...messageWithStableId, chatId }}
                  setMode={setMode}
                  setMessages={setMessages}
                  reload={reload}
                />
              </div>
            )}

            {otherToolInvocations.length > 0 && (
               <div className="flex flex-col gap-4">
                 {otherToolInvocations.map((toolInvocation) => {
                   const { toolName, toolCallId, state, args } = toolInvocation;
                   if (state === 'result') {
                     const result = (toolInvocation as ToolInvocationResult).result;
                     return (
                       <div key={toolCallId}>
                         {toolName === 'updateDocument' ? (
                           <DocumentToolResult type="update" result={result} isReadonly={isReadonly} />
                         ) : toolName === 'requestSuggestions' ? (
                           <DocumentToolResult type="request-suggestions" result={result} isReadonly={isReadonly} />
                         ) : (
                           <pre>{JSON.stringify(result, null, 2)}</pre>
                         )}
                       </div>
                     );
                   }
                   return (
                     <div key={toolCallId}>
                       {toolName === 'updateDocument' ? (
                         <DocumentToolCall type="update" args={args} isReadonly={isReadonly} />
                       ) : toolName === 'requestSuggestions' ? (
                         <DocumentToolCall type="request-suggestions" args={args} isReadonly={isReadonly} />
                       ) : null}
                     </div>
                   );
                 })}
               </div>
            )}

            {!isReadonly && messageWithStableId.role === 'assistant' && (
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
  if (prevProps.isLoading !== nextProps.isLoading) {
     console.log('[PreviewMessage Memo] isLoading changed');
     return false;
  }
  if (!equal(prevProps.vote, nextProps.vote)) {
     console.log('[PreviewMessage Memo] vote changed');
     return false;
  }
  if (!equal(prevProps.message, nextProps.message)) {
     console.log('[PreviewMessage Memo] message object changed (deep)');
     return false;
  }
  console.log('[PreviewMessage Memo] Skipping re-render for message ID:', nextProps.message.id);
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