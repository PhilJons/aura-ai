"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CrossIcon } from "./icons";
import { Button } from "./ui/button";
import { useState } from "react";

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

  if (!isOpen) return null;

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

          <object
            data={pdfUrl}
            type="application/pdf"
            className="w-full h-full"
            aria-label={altText || "PDF document"}
            onLoad={() => setLoaded(true)}
          >
            <p className="p-4 text-foreground dark:text-zinc-300">
              PDF preview is not available in this browser.
            </p>
          </object>

          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 dark:bg-zinc-900/50 text-foreground dark:text-zinc-300 backdrop-blur-sm transition-colors">
              Loading PDF...
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}