'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, X } from 'lucide-react';
import { FilePdf, FileText as PhosphorFileText, Image, File as PhosphorFile, CaretDown, CaretRight } from "@phosphor-icons/react";
import { useEffect, useState, useCallback } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';

interface DocumentFile {
  id?: string; // Message ID for the system message
  name: string;
  content: string;
  metadata?: {
    pages?: number;
    language?: string;
    fileType?: string;
    url?: string;  // URL to the original PDF in blob storage
  };
}

interface SystemPromptDialogProps {
  chatId: string;
  isProcessingMessage?: boolean;
}

interface CollapsibleFileContentProps {
  file: DocumentFile;
  isLoading: boolean;
  onRemove: (file: DocumentFile) => Promise<void>;
}

function getFileIcon(fileType: string | undefined) {
  if (!fileType) return PhosphorFile;
  
  const type = fileType.toLowerCase();
  
  // Handle both MIME types and simple type strings
  if (type.includes('pdf') || type === 'application/pdf') {
    return FilePdf;  // Using Phosphor's FilePdf icon
  }
  if (type.includes('text') || type === 'text/plain' || type === 'text/markdown' || type === 'text/html') {
    return PhosphorFileText;
  }
  if (type.includes('image') || type === 'image/jpeg' || type === 'image/png' || type === 'image/webp' || type === 'image/gif') {
    return Image;
  }
  return PhosphorFile;
}

function formatFileType(fileType: string | undefined): string {
  if (!fileType) return '';
  
  const type = fileType.toLowerCase();
  if (type === 'application/pdf') return 'PDF file';
  if (type === 'text/plain') return 'Text file';
  if (type === 'text/markdown') return 'Markdown file';
  if (type === 'text/html') return 'HTML file';
  if (type.startsWith('image/')) return 'Image file';
  
  return fileType;
}

function CollapsibleFileContent({ file, isLoading, onRemove }: CollapsibleFileContentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const FileIcon = getFileIcon(file.metadata?.fileType);

  const handleRemove = useCallback(async (fileToRemove: DocumentFile) => {
    await onRemove(fileToRemove);
  }, [onRemove]);

  // Format metadata for display - removed language and format file type
  const metadataDisplay = file.metadata ? [
    file.metadata.pages && `${file.metadata.pages} pages`,
    formatFileType(file.metadata.fileType)
  ].filter(Boolean).join(' • ') : '';

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="flex items-center justify-between p-2 rounded-md border">
        <div className="flex flex-col flex-grow">
          <div className="flex items-center gap-2">
            <Collapsible.Trigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-accent">
                {isOpen ? (
                  <CaretDown className="h-4 w-4" />
                ) : (
                  <CaretRight className="h-4 w-4" />
                )}
              </Button>
            </Collapsible.Trigger>
            <FileIcon className="h-4 w-4 text-muted-foreground" weight="fill" />
            <span className="font-medium">{file.name}</span>
            {file.metadata?.url && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                asChild
              >
                <a 
                  href={file.metadata.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  View PDF
                </a>
              </Button>
            )}
          </div>
          {metadataDisplay && (
            <span className="text-xs text-muted-foreground ml-8">
              {metadataDisplay}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => handleRemove(file)}
          disabled={isLoading}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Remove {file.name}</span>
        </Button>
      </div>
      <Collapsible.Content className="overflow-hidden">
        <div className="p-4 pt-2 text-sm">
          <pre className="whitespace-pre-wrap">{file.content}</pre>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function SystemPromptDialog({ chatId, isProcessingMessage = false }: SystemPromptDialogProps) {
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialPolling, setIsInitialPolling] = useState(false);
  const [hasStartedPolling, setHasStartedPolling] = useState(false);

  const parseSystemMessage = (message: { id: string; content: string; role: string }): DocumentFile | null => {
    if (!message?.content || typeof message.content !== 'string' || 
        !message.content.startsWith('Document Intelligence Analysis:')) {
      return null;
    }

    const content = message.content;
    const lines = content.trim().split('\n');
    
    // Remove the prefix
    if (lines[0] === 'Document Intelligence Analysis:') {
      lines.shift();
      if (lines.length > 0 && !lines[0].trim()) lines.shift();
    }

    // Extract metadata if present
    const metadataStartIndex = lines.findIndex((line: string) => line.trim() === 'Metadata:');
    let metadata: Record<string, string> = {};
    let documentContent = '';
    let originalName = '';
    let url = '';

    if (metadataStartIndex !== -1) {
      const metadataLines = lines.slice(metadataStartIndex + 1, metadataStartIndex + 6); // Increased to include URL
      metadataLines.forEach(line => {
        const [key, value] = line.replace('- ', '').split(': ');
        if (key && value) {
          if (key === 'Original Name') {
            originalName = value;
          } else if (key === 'URL') {
            url = value;
          } else {
            metadata[key.toLowerCase()] = value;
          }
        }
      });
      documentContent = lines.slice(metadataStartIndex + 6).join('\n').trim();
    } else {
      documentContent = lines.join('\n').trim();
    }

    // If no original name was found in metadata, try to get it from the content line
    if (!originalName) {
      const nameMatch = lines[0]?.match(/Content from (.+?):/);
      originalName = nameMatch ? nameMatch[1] : '';
    }

    if (!originalName || !documentContent) return null;

    return {
      id: message.id,
      name: originalName,
      content: documentContent,
      metadata: {
        pages: Number(metadata.pages) || undefined,
        language: metadata.language,
        fileType: metadata['file type'],
        url: url || undefined
      }
    };
  };

  const fetchSystemContent = useCallback(async () => {
    if (!chatId) return;
    
    try {
      setError(null);
      console.log('Fetching system content for chat:', chatId);
      const response = await fetch(`/api/chat/message?chatId=${chatId}&includeSystem=true`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      
      const messages = await response.json();
      console.log('Fetched messages:', messages);
      
      const systemMessages = messages.filter((msg: { role: string; content: string }) => 
        msg.role === 'system' && 
        typeof msg.content === 'string' && 
        msg.content.startsWith('Document Intelligence Analysis:')
      );
      console.log('Found system messages:', systemMessages);
      
      const parsedFiles = systemMessages
        .map(parseSystemMessage)
        .filter((file): file is DocumentFile => file !== null);
      console.log('Parsed files:', parsedFiles);
      
      setFiles(parsedFiles);
      return parsedFiles.length > 0;
    } catch (error) {
      console.error('Error fetching system content:', error);
      setError('Failed to load documents');
      setFiles([]);
      return false;
    }
  }, [chatId]);

  // Initial fetch without polling
  useEffect(() => {
    console.log('Initial fetch for chat:', chatId);
    fetchSystemContent();
  }, [fetchSystemContent]);

  // Polling effect for document processing
  useEffect(() => {
    console.log('Polling effect triggered:', { isProcessingMessage, hasStartedPolling, chatId });
    
    // Only start polling when a message is being processed and we haven't started polling yet
    if (!isProcessingMessage || hasStartedPolling) {
      console.log('Skipping polling:', { isProcessingMessage, hasStartedPolling });
      return;
    }

    let pollCount = 0;
    const maxPolls = 20; // Increased max polls
    const pollInterval = 500; // Decreased interval to 500ms
    let pollTimer: NodeJS.Timeout | null = null;

    async function pollForDocuments() {
      console.log('Polling iteration:', { pollCount, maxPolls });
      setIsInitialPolling(true);
      setHasStartedPolling(true);
      const hasDocuments = await fetchSystemContent();
      
      if (hasDocuments || pollCount >= maxPolls) {
        console.log('Polling complete:', { hasDocuments, pollCount });
        setIsInitialPolling(false);
        if (pollTimer) clearTimeout(pollTimer);
        return;
      }

      pollCount++;
      pollTimer = setTimeout(pollForDocuments, pollInterval);
    }

    // Start polling
    console.log('Starting polling for documents...');
    pollForDocuments();

    return () => {
      if (pollTimer) {
        console.log('Cleaning up polling timer');
        clearTimeout(pollTimer);
      }
      setIsInitialPolling(false);
    };
  }, [fetchSystemContent, isProcessingMessage, hasStartedPolling]);

  // Reset polling state when chat ID changes or processing stops
  useEffect(() => {
    console.log('Resetting polling state:', { chatId, isProcessingMessage });
    if (!isProcessingMessage) {
      setHasStartedPolling(false);
      setIsInitialPolling(false);
    }
  }, [chatId, isProcessingMessage]);

  // Subscribe to SSE updates for subsequent changes
  useEffect(() => {
    if (!chatId || isInitialPolling) return; // Don't set up SSE while polling

    let eventSource: EventSource | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    function setupEventSource() {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource(`/api/chat/stream?chatId=${chatId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'document-context-update') {
            console.log('Received document context update, fetching new content...');
            setIsLoading(true);
            fetchSystemContent().finally(() => setIsLoading(false));
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource?.close();
        
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying SSE connection (${retryCount}/${maxRetries})...`);
          setTimeout(setupEventSource, retryDelay * retryCount);
        }
      };

      eventSource.onopen = () => {
        console.log('SSE connection opened');
        retryCount = 0; // Reset retry count on successful connection
      };
    }

    setupEventSource();

    return () => {
      if (eventSource) {
        console.log('Closing SSE connection');
        eventSource.close();
      }
    };
  }, [chatId, fetchSystemContent, isInitialPolling]);

  const removeFile = async (file: DocumentFile) => {
    if (!file.id) {
      console.error('No message ID found for file:', file);
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/chat/message?chatId=${chatId}&messageId=${file.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete system message');
    } catch (error) {
      console.error('Error removing file:', error);
      setError('Failed to remove document');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {(files.length > 0 || isInitialPolling) && (
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 relative" 
            aria-label="View Document Context"
          >
            <Info className="h-4 w-4" />
            {files.length > 0 && (
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium flex items-center justify-center text-primary-foreground">
                {files.length}
              </div>
            )}
            {isInitialPolling && (
              <div className="absolute inset-0 rounded-md bg-background/80 flex items-center justify-center">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <span className="sr-only">View Document Context</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Document Context</DialogTitle>
          <DialogDescription>
            {isInitialPolling 
              ? "Processing documents..."
              : files.length > 0 
                ? `${files.length} document${files.length === 1 ? '' : 's'} in the current context`
                : "No documents have been added to the context yet. Upload files to add them to the conversation."}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px] rounded-md border">
          {error ? (
            <div className="flex items-center justify-center h-full text-destructive">
              <p>{error}</p>
            </div>
          ) : isLoading || isInitialPolling ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground">
                {isInitialPolling ? "Processing documents..." : "Updating documents..."}
              </span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No documents in context</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-2">
              {files.map((file: DocumentFile) => (
                <CollapsibleFileContent
                  key={file.id || file.name}
                  file={file}
                  isLoading={isLoading}
                  onRemove={removeFile}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
} 