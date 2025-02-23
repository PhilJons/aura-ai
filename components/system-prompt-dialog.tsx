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
import { Info, X, RefreshCw } from 'lucide-react';
import { FilePdf, FileText as PhosphorFileText, Image, File as PhosphorFile, CaretDown, CaretRight } from "@phosphor-icons/react";
import { useEffect, useState, useCallback } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { markFileUploadStarted, markFileUploadComplete } from '@/lib/utils/stream';
import { cn } from '@/lib/utils';

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
  isProcessingFile?: boolean;
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

  // Check if the file is a PDF
  const isPdf = file.metadata?.fileType?.toLowerCase().includes('pdf') || file.metadata?.fileType === 'application/pdf';

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="flex items-center justify-between p-2 rounded-md border">
        <div className="grow">
          <div className="flex items-center gap-2">
            <Collapsible.Trigger asChild>
              <Button variant="ghost" size="icon" className="size-6 hover:bg-accent">
                {isOpen ? (
                  <CaretDown className="size-4" />
                ) : (
                  <CaretRight className="size-4" />
                )}
              </Button>
            </Collapsible.Trigger>
            <FileIcon className="size-4 text-muted-foreground" weight="fill" />
            <span className="font-medium">{file.name}</span>
            {isPdf && file.metadata?.url && (
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
          className="size-8"
          onClick={() => handleRemove(file)}
          disabled={isLoading}
        >
          <X className="size-4" />
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

export function SystemPromptDialog({ chatId, isProcessingFile = false }: SystemPromptDialogProps) {
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialPolling, setIsInitialPolling] = useState(false);
  const [hasStartedPolling, setHasStartedPolling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    const metadata: Record<string, string> = {};
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
        .filter((file: DocumentFile | null): file is DocumentFile => file !== null);
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

  const handleRefresh = useCallback(async () => {
    if (!chatId || isRefreshing) return;

    console.log('[SystemPromptDialog] Starting refresh:', {
      chatId,
      timestamp: new Date().toISOString()
    });

    setIsRefreshing(true);
    setError(null);

    try {
      // Start processing
      console.log('[SystemPromptDialog] Marking file upload started');
      markFileUploadStarted(chatId);
      
      // Set up SSE connection
      console.log('[SystemPromptDialog] Setting up SSE connection for refresh');
      const eventSource = new EventSource(`/api/chat/stream?chatId=${chatId}`);
      
      let isComplete = false;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SystemPromptDialog] Received refresh message:', {
            type: data.type,
            timestamp: new Date().toISOString()
          });
          
          if (data.type === 'document-context-update-complete') {
            console.log('[SystemPromptDialog] Document context update complete');
            isComplete = true;
            markFileUploadComplete(chatId);
            eventSource.close();
            fetchSystemContent().finally(() => setIsRefreshing(false));
          }
        } catch (error) {
          console.error('[SystemPromptDialog] Error handling refresh message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[SystemPromptDialog] Refresh SSE error:', error);
        if (!isComplete) {
          console.log('[SystemPromptDialog] Closing connection due to error');
          markFileUploadComplete(chatId);
          eventSource.close();
          fetchSystemContent().finally(() => setIsRefreshing(false));
        }
      };

      // Fallback timeout
      setTimeout(() => {
        if (!isComplete) {
          console.log('[SystemPromptDialog] Refresh timeout reached');
          markFileUploadComplete(chatId);
          eventSource.close();
          fetchSystemContent().finally(() => setIsRefreshing(false));
        }
      }, 10000);

    } catch (error) {
      console.error('[SystemPromptDialog] Error during refresh:', error);
      setError('Failed to refresh documents');
      setIsRefreshing(false);
    }
  }, [chatId, isRefreshing, fetchSystemContent]);

  // Initial fetch without polling
  useEffect(() => {
    console.log('Initial fetch for chat:', chatId);
    fetchSystemContent();
  }, [fetchSystemContent, chatId]);

  // Polling effect for document processing
  useEffect(() => {
    console.log('Polling effect triggered:', { isProcessingFile, hasStartedPolling, chatId });
    
    // Only start polling when a file is being processed and we haven't started polling yet
    if (!isProcessingFile || hasStartedPolling) {
      console.log('Skipping polling:', { isProcessingFile, hasStartedPolling });
      return;
    }

    let pollCount = 0;
    const maxPolls = 20;
    const pollInterval = 500;
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
  }, [fetchSystemContent, isProcessingFile, hasStartedPolling, chatId]);

  // Reset polling state when chat ID changes or processing stops
  useEffect(() => {
    console.log('Resetting polling state:', { chatId, isProcessingFile });
    if (!isProcessingFile) {
      setHasStartedPolling(false);
      setIsInitialPolling(false);
    }
  }, [chatId, isProcessingFile]);

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
      
      // Update the files state to remove the deleted file
      setFiles(prevFiles => prevFiles.filter(f => f.id !== file.id));
      
    } catch (error) {
      console.error('Error removing file:', error);
      setError('Failed to remove document');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {(files.length > 0 || isInitialPolling) && (
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="size-9 relative" 
            aria-label="View Document Context"
          >
            <Info className="size-4" />
            {files.length > 0 && (
              <div className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-[10px] font-medium flex items-center justify-center text-primary-foreground">
                {files.length}
              </div>
            )}
            {isInitialPolling && (
              <div className="absolute inset-0 rounded-md bg-background/80 flex items-center justify-center">
                <div className="size-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <span className="sr-only">View Document Context</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl [&>button]:hidden">
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing || isInitialPolling}
            className="shrink-0"
          >
            <RefreshCw className={cn("size-4", { "animate-spin": isRefreshing })} />
            <span className="sr-only">Refresh document context</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsOpen(false)}
            className="shrink-0"
          >
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
        <DialogHeader>
          <div>
            <DialogTitle>Document Context</DialogTitle>
            <DialogDescription>
              {isInitialPolling 
                ? "Processing documents..."
                : files.length > 0 
                  ? `${files.length} document${files.length === 1 ? '' : 's'} in the current context`
                  : "No documents have been added to the context yet. Upload files to add them to the conversation."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[400px] rounded-md border">
          {error ? (
            <div className="flex items-center justify-center h-full text-destructive">
              <p>{error}</p>
            </div>
          ) : isLoading || isInitialPolling || isRefreshing ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground">
                {isInitialPolling ? "Processing documents..." : isRefreshing ? "Refreshing documents..." : "Updating documents..."}
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