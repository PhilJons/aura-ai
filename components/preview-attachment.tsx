"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from 'next/image';
import { cn } from "@/lib/utils";
import { File, FilePdf, FileText, X, Spinner } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { ImageOverlay } from "./image-overlay";
import { PdfOverlay } from "./pdf-overlay";

/*
<ai_context>
  This component displays a file attachment preview.
  We now add support for "application/pdf" via PdfOverlay.
</ai_context>
*/

function JsonIcon({ className }: { className?: string }) {
  return <File className={className} weight="fill" />;
}

function TextFileIcon({ className }: { className?: string }) {
  return <FileText className={className} weight="fill" />;
}

function FileProcessingAnimation({ type }: { type: 'pdf' | 'text' }) {
  const colors = type === 'pdf' 
    ? {
        bg: 'bg-red-50/80 dark:bg-red-950/50',
        icon: 'bg-red-200/90 dark:bg-red-800/80',
        lines: 'bg-red-300/90 dark:bg-red-700/80',
        text: 'text-red-600 dark:text-red-400'
      }
    : {
        bg: 'bg-blue-50/80 dark:bg-blue-950/50',
        icon: 'bg-blue-200/90 dark:bg-blue-800/80',
        lines: 'bg-blue-300/90 dark:bg-blue-700/80',
        text: 'text-blue-600 dark:text-blue-400'
      };

  return (
    <div className={cn("relative size-full rounded-[var(--radius-sm)] flex items-center justify-center transition-colors duration-200", colors.bg)}>
      <motion.div 
        className="size-12 h-14 relative"
        animate={{ 
          scale: [1, 1.05, 1],
          opacity: [1, 0.7, 1] 
        }}
        transition={{ 
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut"
        }}
      >
        {/* Icon base */}
        <div className={cn("absolute inset-0 rounded-sm transition-colors duration-200", colors.icon)} />
        {/* Lines animation */}
        <motion.div 
          className={cn("absolute inset-x-2 h-1 rounded-full transition-colors duration-200", colors.lines)}
          initial={{ y: 3 }}
          animate={{ 
            y: [3, 6, 9, 6, 3],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{ 
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className={cn("absolute inset-x-2 h-1 rounded-full transition-colors duration-200", colors.lines)}
          initial={{ y: 6 }}
          animate={{ 
            y: [6, 9, 12, 9, 6],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{ 
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
            delay: 0.2
          }}
        />
        <motion.div 
          className={cn("absolute inset-x-2 h-1 rounded-full transition-colors duration-200", colors.lines)}
          initial={{ y: 9 }}
          animate={{ 
            y: [9, 12, 15, 12, 9],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{ 
            duration: 2,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
            delay: 0.4
          }}
        />
      </motion.div>
      <motion.div 
        className={cn("absolute bottom-2 text-xs font-medium transition-colors duration-200", colors.text)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Processing {type === 'pdf' ? 'PDF' : 'Text'}
      </motion.div>
    </div>
  );
}

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: {
    url?: string;
    name?: string;
    contentType?: string;
    isAzureExtractedJson?: boolean;
    associatedPdfName?: string;
    pdfUrl?: string;
  };
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  console.log("PreviewAttachment - Rendering attachment:", {
    name: attachment.name,
    url: attachment.url?.substring(0, 30) + '...',
    contentType: attachment.contentType,
    isUploading
  });
  
  const { 
    name = "", 
    url = "", 
    contentType = "", 
    isAzureExtractedJson = false,
    associatedPdfName = "",
    pdfUrl = ""
  } = attachment;
  const [isImageOverlayOpen, setIsImageOverlayOpen] = useState(false);
  const [isPdfOverlayOpen, setIsPdfOverlayOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [pdfSasUrl, setPdfSasUrl] = useState<string | null>(null);
  const [isLoadingSas, setIsLoadingSas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = name?.split("/").pop() || "Untitled";

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Ensure the click event doesn't propagate to parent elements
    // This prevents the attachment from being opened when removing it
    e.nativeEvent.stopImmediatePropagation();
    
    // Call the onRemove callback
    // Note: For image attachments, the parent component is responsible for removing
    // the attachment from persistent storage when this callback is invoked
    onRemove?.();
  };

  const isImage = contentType?.startsWith("image/") ?? false;
  const isPdf = contentType === "application/pdf";
  const isText = contentType === "text/plain";
  const isJson = contentType === "application/json" && !isAzureExtractedJson;
  const hasContext = (isPdf || isText) && associatedPdfName === displayName;

  if (isAzureExtractedJson) return null;

  const getFileColor = () => {
    if (isPdf) return "hover:bg-red-100/80 dark:hover:bg-red-900/50";
    if (isText || isJson) return "hover:bg-blue-100/80 dark:hover:bg-blue-900/50";
    return "hover:bg-zinc-100/80 dark:hover:bg-zinc-900/50";
  };

  const handleBoxClick = async () => {
    if (isImage) {
      setIsImageOverlayOpen(true);
    } else if (isPdf) {
      // For PDFs, we'll use the pdfUrl if available, or the regular url as fallback
      const pdfUrlToUse = pdfUrl || url;
      
      if (pdfUrlToUse) {
        setIsPdfOverlayOpen(true);
      }
    }
  };

  return (
    <>
      <div className="group relative">
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "relative w-full min-w-[200px] max-w-[300px] h-14 bg-muted/40 dark:bg-muted/20",
            "rounded-lg border border-border/50 dark:border-border/30",
            "flex items-center gap-3 px-3 cursor-pointer overflow-visible",
            "transition-all duration-200",
            getFileColor(),
            isUploading && "opacity-80",
            (isImage || isPdf) && !isUploading && "cursor-pointer"
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={!isUploading ? handleBoxClick : undefined}
        >
          {/* File Icon/Preview Section */}
          <div className="size-8 flex items-center justify-center shrink-0">
            {isImage && (
              <Image
                src={url}
                alt={name}
                width={32}
                height={32}
                className="object-cover rounded w-8 h-8"
              />
            )}

            {isPdf && !isUploading && (
              <div className="size-full flex items-center justify-center">
                <FilePdf className="size-8 text-red-500 dark:text-red-400" weight="fill" />
              </div>
            )}

            {isPdf && isUploading && (
              <div className="size-full scale-75">
                <FileProcessingAnimation type="pdf" />
              </div>
            )}

            {isText && !isUploading && (
              <TextFileIcon className="size-8 text-blue-500 dark:text-blue-400" />
            )}

            {isText && isUploading && (
              <div className="size-full scale-75">
                <FileProcessingAnimation type="text" />
              </div>
            )}

            {isJson && (
              <JsonIcon className="size-8 text-blue-500 dark:text-blue-400" />
            )}

            {!isImage && !isPdf && !isText && !isJson && !isUploading && (
              <div className="text-xs text-muted-foreground">
                {contentType?.split("/").pop() || "unknown"}
              </div>
            )}

            {isUploading && !isPdf && !isText && (
              <div className="animate-spin text-muted-foreground">
                <Spinner size={16} />
              </div>
            )}
          </div>

          {/* File Info Section */}
          <div className="flex flex-col min-w-0 gap-0.5 py-2">
            <p className="text-sm font-medium truncate text-foreground">
              {displayName}
            </p>
            {hasContext && (
              <div className="flex items-center gap-1.5">
                <div className="size-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse" />
                <span className="text-[10px] text-green-700 dark:text-green-300 font-medium">
                  Context loaded
                </span>
              </div>
            )}
          </div>

          {/* Remove Button */}
          {!isUploading && onRemove && (
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "absolute -top-2 -right-2 size-5",
                "rounded-full bg-background/80 dark:bg-background/40",
                "hover:bg-background/90 dark:hover:bg-background/60",
                "border dark:border-zinc-700/80 shadow-sm",
                "text-foreground/80 opacity-0 group-hover:opacity-100",
                "transition-all duration-200"
              )}
              onClick={handleRemove}
            >
              <X size={12} weight="bold" />
            </Button>
          )}
        </div>
      </div>

      {isImageOverlayOpen && (
        <ImageOverlay
          imageUrl={url}
          altText={displayName}
          isOpen={isImageOverlayOpen}
          onClose={() => setIsImageOverlayOpen(false)}
        />
      )}

      {isPdfOverlayOpen && (
        <PdfOverlay
          pdfUrl={pdfUrl || url}
          altText={displayName}
          isOpen={isPdfOverlayOpen}
          onClose={() => setIsPdfOverlayOpen(false)}
        />
      )}
    </>
  );
};