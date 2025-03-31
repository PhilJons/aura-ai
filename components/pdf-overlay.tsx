"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CrossIcon } from "./icons";
import { Button } from "./ui/button";
import { useState, useEffect } from "react";
import { logger } from "@/lib/utils/logger";

/*
<ai_context>
  This component displays an overlay for viewing PDFs.
  It is similar in style to image-overlay.tsx.
</ai_context>
*/

interface PdfOverlayProps {
  pdfUrl: string;
  altText?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PdfOverlay({
  pdfUrl,
  altText,
  isOpen,
  onClose,
}: PdfOverlayProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sasUrl, setSasUrl] = useState<string | null>(null);
  const [isLoadingSas, setIsLoadingSas] = useState(false);

  useEffect(() => {
    if (isOpen && pdfUrl) {
      // Log the PDF URL for debugging
      logger.document.debug('Opening PDF in overlay', {
        pdfUrl: pdfUrl || 'No URL provided',
        timestamp: new Date().toISOString()
      });
      
      // Reset states when opening
      setLoaded(false);
      setError(null);
      setSasUrl(null);
      
      // Get a fresh SAS URL for the PDF
      const fetchSasUrl = async () => {
        try {
          setIsLoadingSas(true);
          
          // Extract the blob name from the URL
          const blobNameMatch = pdfUrl.match(/\/([^/?]+)(?:\?|$)/);
          const blobName = blobNameMatch ? blobNameMatch[1] : null;
          
          if (!blobName) {
            throw new Error("Could not extract blob name from PDF URL");
          }
          
          logger.document.debug('Requesting fresh SAS URL for PDF overlay', {
            blobName,
            pdfUrl
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
          
          logger.document.debug('Received fresh SAS URL for PDF overlay', {
            blobName,
            sasUrl: `${data.sasUrl.substring(0, 50)}...`
          });
          
          setSasUrl(data.sasUrl);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.document.error('Error getting fresh SAS URL for PDF overlay', {
            error: errorMessage,
            pdfUrl
          });
          setError(`Failed to get secure access to PDF: ${errorMessage}`);
          // We'll still try to use the original URL as a fallback
          setSasUrl(pdfUrl);
        } finally {
          setIsLoadingSas(false);
        }
      };
      
      fetchSasUrl();
    }
  }, [isOpen, pdfUrl]);

  if (!isOpen) return null;

  const handleLoad = () => {
    setLoaded(true);
    setError(null);
    logger.document.debug('PDF loaded successfully', {
      pdfUrl: sasUrl || pdfUrl || 'No URL provided',
      timestamp: new Date().toISOString()
    });
  };

  const handleError = () => {
    setError("Failed to load PDF. The URL may be invalid or inaccessible.");
    logger.document.error('Failed to load PDF', {
      pdfUrl: sasUrl || pdfUrl || 'No URL provided',
      timestamp: new Date().toISOString()
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 dark:bg-black/90 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="relative flex w-full max-w-4xl h-[90vh] bg-background dark:bg-zinc-900 rounded-md overflow-hidden shadow-2xl border dark:border-zinc-800 transition-colors duration-200"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
        >
          <Button
            variant="ghost"
            className="absolute top-2 right-2 bg-background/80 dark:bg-zinc-900/80 text-foreground hover:bg-muted dark:hover:bg-zinc-800/80 backdrop-blur-sm transition-colors z-10"
            onClick={onClose}
          >
            <CrossIcon />
          </Button>

          {isLoadingSas ? (
            <div className="flex items-center justify-center size-full">
              <p className="text-foreground dark:text-zinc-300">
                Loading secure PDF access...
              </p>
            </div>
          ) : sasUrl ? (
            <object
              data={sasUrl}
              type="application/pdf"
              className="size-full"
              aria-label={altText || "PDF document"}
              onLoad={handleLoad}
              onError={handleError}
            >
              <p className="p-4 text-foreground dark:text-zinc-300">
                PDF preview is not available in this browser.
              </p>
            </object>
          ) : (
            <div className="flex items-center justify-center size-full">
              <p className="text-foreground dark:text-zinc-300">
                No PDF URL provided.
              </p>
            </div>
          )}

          {!loaded && !error && !isLoadingSas && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 dark:bg-zinc-900/50 text-foreground dark:text-zinc-300 backdrop-blur-sm transition-colors size-full">
              Loading PDF...
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 dark:bg-zinc-900/50 text-red-500 dark:text-red-400 backdrop-blur-sm transition-colors size-full">
              {error}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}