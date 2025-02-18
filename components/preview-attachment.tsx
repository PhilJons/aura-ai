"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { LoaderIcon, CrossSmallIcon } from "./icons";
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
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
    >
      {/* Background */}
      <path
        d="M6 2C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V7L15 2H6Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      {/* {...} */}
      <text
        x="7.5"
        y="15"
        fontSize="9"
        fontFamily="monospace"
        fill="currentColor"
      >
        {"{...}"}
      </text>
      {/* Folded Corner */}
      <path
        d="M20 7L15 2V5C15 6.10457 15.8954 7 17 7H20Z"
        fill="currentColor"
        fillOpacity="0.4"
      />
    </svg>
  );
}

function PdfProcessingAnimation() {
  return (
    <div className="relative w-full h-full bg-red-50/80 dark:bg-red-950/50 rounded-[var(--radius-sm)] flex items-center justify-center transition-colors duration-200">
      <motion.div 
        className="w-12 h-14 relative"
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
        {/* PDF icon base */}
        <div className="absolute inset-0 bg-red-200/90 dark:bg-red-800/80 rounded-sm transition-colors duration-200" />
        {/* Lines animation */}
        <motion.div 
          className="absolute inset-x-2 h-1 bg-red-300/90 dark:bg-red-700/80 rounded-full transition-colors duration-200"
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
          className="absolute inset-x-2 h-1 bg-red-300/90 dark:bg-red-700/80 rounded-full transition-colors duration-200"
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
          className="absolute inset-x-2 h-1 bg-red-300/90 dark:bg-red-700/80 rounded-full transition-colors duration-200"
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
        className="absolute bottom-2 text-xs text-red-600 dark:text-red-400 font-medium transition-colors duration-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        Processing PDF
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
    associatedPdfName?: string;  // Name of the PDF this JSON is associated with
  };
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { 
    name = "", 
    url = "", 
    contentType = "", 
    isAzureExtractedJson = false,
    associatedPdfName = ""
  } = attachment;
  const [isImageOverlayOpen, setIsImageOverlayOpen] = useState(false);
  const [isPdfOverlayOpen, setIsPdfOverlayOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const displayName = name?.split("/").pop() || "Untitled";

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove?.();
  };

  // Simple check if it's an image
  const isImage = contentType?.startsWith("image/") ?? false;
  // Check if it's a PDF
  const isPdf = contentType === "application/pdf";
  // Check if it's a manually uploaded JSON file (not from Azure DI)
  const isJson = contentType === "application/json" && !isAzureExtractedJson;
  // Check if this PDF has an associated JSON context (by checking if this PDF's name matches any JSON's associatedPdfName)
  const hasContext = isPdf && associatedPdfName === displayName;

  // Don't render Azure extracted JSON files
  if (isAzureExtractedJson) {
    return null;
  }

  return (
    <>
      <div className="group relative mb-6">
        {hasContext && (
          <motion.div 
            className="absolute -bottom-8 left-0 flex items-center gap-1.5 px-2 py-0.5 bg-green-50/80 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-full z-20 shadow-sm backdrop-blur-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse" />
            <span className="text-[10px] text-green-700 dark:text-green-300 whitespace-nowrap font-medium">Context loaded</span>
          </motion.div>
        )}

        <div
          role="button"
          tabIndex={0}
          className="relative w-32 h-24 bg-muted dark:bg-muted/40 rounded-[var(--radius-sm)] flex items-center justify-center cursor-pointer overflow-visible"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={displayName}
              className="rounded-[var(--radius-sm)] size-full object-cover"
              onClick={() => setIsImageOverlayOpen(true)}
            />
          )}

          {isPdf && !isUploading && (
            <div className="relative w-full h-full overflow-visible">
              <div
                role="button"
                tabIndex={0}
                className="bg-red-50/80 dark:bg-red-950/50 flex items-center justify-center w-full h-full hover:bg-red-100/80 dark:hover:bg-red-900/50 transition-colors rounded-[var(--radius-sm)] backdrop-blur-sm"
                onClick={() => setIsPdfOverlayOpen(true)}
              >
                <img 
                  src="/images/256px-PDF_file_icon.svg.png"
                  alt="PDF file"
                  className="w-12 h-12 object-contain opacity-90 dark:opacity-70 transition-opacity"
                />
              </div>
            </div>
          )}

          {isPdf && isUploading && (
            <PdfProcessingAnimation />
          )}

          {isJson && (
            <div
              className="bg-blue-50/80 dark:bg-blue-950/50 flex items-center justify-center w-full h-full hover:bg-blue-100/80 dark:hover:bg-blue-900/50 transition-colors rounded-[var(--radius-sm)] backdrop-blur-sm"
            >
              <JsonIcon className="w-16 h-16 text-blue-500 dark:text-blue-400" />
            </div>
          )}

          {!isImage && !isPdf && !isJson && !isUploading && (
            <div className="text-xs text-muted-foreground px-2 text-center">
              {contentType?.split("/").pop() || "unknown"}
            </div>
          )}

          {isUploading && !isPdf && (
            <div className="animate-spin absolute text-muted-foreground">
              <LoaderIcon />
            </div>
          )}

          {!isUploading && onRemove && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute -top-2 -right-2 size-5 rounded-full bg-background/80 dark:bg-background/40 hover:bg-background/90 dark:hover:bg-background/60 border dark:border-zinc-700/80 shadow-sm z-10 backdrop-blur-sm text-foreground/80"
              onClick={handleRemove}
            >
              <CrossSmallIcon size={12} />
            </Button>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ 
              opacity: isHovered ? 1 : 0,
              y: isHovered ? 0 : 10
            }}
            transition={{ duration: 0.2 }}
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full px-2 py-1 bg-background/90 dark:bg-zinc-800/90 text-foreground backdrop-blur-sm text-xs rounded-md whitespace-nowrap z-50 border dark:border-zinc-700/50"
          >
            {displayName}
          </motion.div>
        </div>
      </div>

      {isImage && (
        <ImageOverlay
          imageUrl={url}
          altText={displayName}
          isOpen={isImageOverlayOpen}
          onClose={() => setIsImageOverlayOpen(false)}
        />
      )}

      {isPdf && (
        <PdfOverlay
          pdfUrl={url}
          altText={displayName}
          isOpen={isPdfOverlayOpen}
          onClose={() => setIsPdfOverlayOpen(false)}
        />
      )}
    </>
  );
};