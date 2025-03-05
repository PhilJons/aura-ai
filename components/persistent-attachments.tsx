"use client";

import { Attachment } from 'ai';
import { usePersistentAttachments } from '@/lib/hooks/use-persistent-attachments';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PersistentAttachmentsProps {
  chatId: string;
  className?: string;
}

export function PersistentAttachments({ chatId, className }: PersistentAttachmentsProps) {
  const {
    persistentAttachments,
    removePersistentAttachment,
    clearPersistentAttachments
  } = usePersistentAttachments(chatId);

  if (persistentAttachments.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-2 p-2 rounded-md bg-muted/50", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Persistent Images</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={clearPersistentAttachments}
        >
          Clear All
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {persistentAttachments.map((attachment) => (
          <div key={attachment.url} className="relative group">
            <PreviewAttachment
              attachment={attachment}
              onRemove={() => removePersistentAttachment(attachment.url)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-background border border-border opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => removePersistentAttachment(attachment.url)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
} 