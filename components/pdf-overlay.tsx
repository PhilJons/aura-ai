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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="relative flex w-full max-w-4xl h-[90vh] bg-background rounded-md overflow-hidden"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
        >
          <Button
            variant="ghost"
            className="absolute top-2 right-2 bg-background text-foreground hover:bg-muted"
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
            <p className="p-4">
              PDF preview is not available in this browser.
            </p>
          </object>

          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 text-foreground">
              Loading PDF...
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}