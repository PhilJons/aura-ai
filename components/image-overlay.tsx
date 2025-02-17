"use client"

import { motion, AnimatePresence } from "framer-motion"

interface ImageOverlayProps {
  imageUrl: string
  altText: string
  isOpen: boolean
  onClose: () => void
}

export function ImageOverlay({ imageUrl, altText, isOpen, onClose }: ImageOverlayProps) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.95 }}
          className="relative max-w-[90vw] max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={altText}
            className="rounded-lg object-contain max-w-full max-h-[90vh]"
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
} 