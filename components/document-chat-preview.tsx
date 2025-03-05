"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, FileIcon, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { debug } from "@/lib/utils/debug";
import { logger } from "@/lib/utils/logger";

/*
<ai_context>
  This component displays a document preview in the chat thread.
  It's specifically designed for showing document information in user messages.
</ai_context>
*/

interface DocumentChatPreviewProps {
  document: {
    name: string;
    contentType: string;
    url?: string;
    pdfUrl?: string;
  };
}

export function DocumentChatPreview({ document }: DocumentChatPreviewProps) {
  const isPdf = document.contentType === "application/pdf";
  const isText = document.contentType === "text/plain";
  const isJson = document.contentType === "application/json";
  const [sasUrl, setSasUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Debug the document props
  useEffect(() => {
    debug('document', 'DocumentChatPreview rendered', {
      name: document.name,
      contentType: document.contentType,
      hasUrl: !!document.url,
      url: document.url,
      hasPdfUrl: !!document.pdfUrl,
      pdfUrl: document.pdfUrl
    });
  }, [document]);
  
  // For PDFs, fetch a fresh SAS URL when needed
  useEffect(() => {
    if (isPdf && document.pdfUrl) {
      // Extract the blob name from the URL
      const blobNameMatch = document.pdfUrl.match(/\/([^/?]+)(?:\?|$)/);
      const blobName = blobNameMatch ? blobNameMatch[1] : null;
      
      if (blobName) {
        debug('document', 'Extracted blob name from PDF URL', {
          pdfUrl: document.pdfUrl,
          blobName
        });
      } else {
        debug('document', 'Failed to extract blob name from PDF URL', {
          pdfUrl: document.pdfUrl
        });
      }
    }
  }, [isPdf, document.pdfUrl]);
  
  const handleClick = async () => {
    // For PDFs, get a fresh SAS URL
    if (isPdf && document.pdfUrl) {
      try {
        setIsLoading(true);
        setError(null);
        
        // Extract the blob name from the URL
        const blobNameMatch = document.pdfUrl.match(/\/([^/?]+)(?:\?|$)/);
        const blobName = blobNameMatch ? blobNameMatch[1] : null;
        
        if (!blobName) {
          throw new Error("Could not extract blob name from PDF URL");
        }
        
        logger.document.debug('Requesting fresh SAS URL for PDF', {
          blobName,
          pdfUrl: document.pdfUrl
        });
        
        const response = await fetch('/api/files/pdf-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ blobName }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || response.statusText);
        }
        
        const data = await response.json();
        
        logger.document.debug('Received fresh SAS URL for PDF', {
          blobName,
          sasUrl: data.sasUrl.substring(0, 50) + '...'
        });
        
        // Open the PDF with the fresh SAS URL
        window.open(data.sasUrl, "_blank");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.document.error('Error getting fresh SAS URL for PDF', {
          error: errorMessage,
          pdfUrl: document.pdfUrl
        });
        setError(errorMessage);
        
        // Fallback to the original URL
        if (document.url) {
          window.open(document.url, "_blank");
        }
      } finally {
        setIsLoading(false);
      }
    } else if (document.url) {
      // For non-PDFs, just open the URL
      debug('document', 'Opening document in new tab', {
        name: document.name,
        contentType: document.contentType,
        url: document.url
      });
      window.open(document.url, "_blank");
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-md",
        document.url || document.pdfUrl ? "cursor-pointer" : "cursor-default",
        "bg-muted/50 hover:bg-muted transition-colors",
        "border border-border/50 max-w-xs",
        isPdf ? "hover:bg-red-50/80 dark:hover:bg-red-950/30" : 
        isText ? "hover:bg-blue-50/80 dark:hover:bg-blue-950/30" :
        isJson ? "hover:bg-green-50/80 dark:hover:bg-green-950/30" :
        "hover:bg-zinc-100/80 dark:hover:bg-zinc-900/30",
        isLoading && "opacity-70"
      )}
      onClick={(document.url || document.pdfUrl) && !isLoading ? handleClick : undefined}
    >
      {isPdf ? (
        <FileText className="size-6 text-red-500 dark:text-red-400" />
      ) : isText ? (
        <FileText className="size-6 text-blue-500 dark:text-blue-400" />
      ) : isJson ? (
        <File className="size-6 text-green-500 dark:text-green-400" />
      ) : (
        <FileIcon className="size-6 text-gray-500 dark:text-gray-400" />
      )}
      
      <div className="flex flex-col overflow-hidden">
        <span className="text-sm font-medium truncate">{document.name}</span>
        <span className="text-xs text-muted-foreground">
          {isPdf ? "PDF Document" : isText ? "Text File" : isJson ? "JSON File" : "Document"}
          {(document.url || document.pdfUrl) && <span className="ml-1 opacity-70">• Click to open</span>}
          {isLoading && <span className="ml-1 opacity-70">• Loading...</span>}
        </span>
        {error && (
          <span className="text-xs text-red-500 dark:text-red-400 mt-1 truncate">
            Error: {error}
          </span>
        )}
      </div>
    </motion.div>
  );
} 