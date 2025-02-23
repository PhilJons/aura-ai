"use server";

/*
<ai_context>
Client: This route handles file uploads and stores them in Azure Blob Storage.
We are modifying it to handle PDF in a two-step approach:
1) Upload the raw PDF as application/pdf
2) If PDF, call processDocument for text extraction, store that as application/json
Then return both attachments in the response.

We also keep existing logic for other file types.
</ai_context>
*/

import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

import { auth } from "@/app/(auth)/auth";
import { uploadBlob } from "@/lib/azure/blob";
import { processDocument } from "@/lib/azure/document";
import { logger } from "@/lib/utils/logger";
import { uploadFile } from '@/lib/utils/upload';
import { markFileUploadStarted, markFileUploadComplete } from '@/lib/utils/stream';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

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

    // Validate file
    const validationResult = FileSchema.safeParse({ file });
    if (!validationResult.success) {
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
      const attachments = await uploadFile(file);

      // Mark upload complete
      markFileUploadComplete(chatId);

      return new Response(JSON.stringify(attachments), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Make sure to mark upload complete even on error
      markFileUploadComplete(chatId);
      throw error;
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to upload file' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}