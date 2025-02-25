import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { uploadFile } from '@/lib/utils/upload';
import { markFileUploadStarted, markFileUploadComplete } from '@/lib/utils/stream';
import { logger } from "@/lib/utils/logger";

// Increase max file size to 30MB
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp"
];

const FileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: `File size should be < ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    })
    .refine(
      (file) => ALLOWED_MIME_TYPES.includes(file.type),
      {
        message: "Unsupported file type. Please upload PDF, text, or image files.",
      }
    ),
});

function guessMimeType(filename: string, providedType: string): string {
  if (ALLOWED_MIME_TYPES.includes(providedType)) return providedType;
  // Fallback to octet-stream if we can't confidently map the extension
  return "application/octet-stream";
}

// Set response timeout to 55 seconds (just under Vercel's 60s limit)
export const maxDuration = 55;

export async function POST(request: Request) {
  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const chatId = formData.get('chatId') as string;

    if (!file) {
      return new Response('No file provided', { status: 400 });
    }

    if (!chatId) {
      return new Response('No chat ID provided', { status: 400 });
    }

    // Log file details
    logger.upload.info('File upload request received', {
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      chatId
    });

    // Validate file
    const validationResult = FileSchema.safeParse({ file });
    if (!validationResult.success) {
      logger.upload.error('File validation failed', {
        error: validationResult.error.errors[0].message,
        filename: file.name
      });
      return new Response(
        JSON.stringify({ error: validationResult.error.errors[0].message }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Mark upload started
    markFileUploadStarted(chatId);

    try {
      // For PDFs, log that we're starting the processing
      if (file.type === 'application/pdf') {
        logger.document.info('Starting PDF processing', {
          filename: file.name,
          fileSize: file.size,
          chatId
        });
      }

      const attachments = await uploadFile(file);

      // Mark upload complete
      markFileUploadComplete(chatId);

      logger.upload.info('File upload completed successfully', {
        filename: file.name,
        attachmentCount: attachments.length,
        chatId
      });

      return new Response(JSON.stringify(attachments), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Make sure to mark upload complete even on error
      markFileUploadComplete(chatId);
      
      logger.upload.error('Error during file processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filename: file.name,
        chatId
      });
      
      throw error;
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    logger.upload.error('File upload failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to upload file', 
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}