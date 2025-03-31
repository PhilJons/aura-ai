"use client";

import { Markdown } from "./markdown";
import { debug } from "@/lib/utils/debug";
import { useEffect } from "react";

interface StreamingMarkdownProps {
  content: string;
  messageId?: string; // Optional for debugging
}

/**
 * A simple component dedicated to rendering markdown content.
 * It's intentionally NOT memoized to ensure it always updates
 * when the content prop changes during streaming.
 */
export function StreamingMarkdown({ content, messageId }: StreamingMarkdownProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      debug('message', 'StreamingMarkdown rendered', {
        messageId: messageId || 'unknown',
        contentLength: content?.length,
      });
    }
  }, [content, messageId]);

  return (
    <div className="!mb-0">
      <Markdown className="[&_*]:!text-inherit [&_p]:!m-0 [&>*:last-child]:!mb-0 [&>*:first-child]:!mt-0">
        {content || ''}
      </Markdown>
    </div>
  );
} 