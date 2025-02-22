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

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const ALLOWED_MIME_TYPES = [
  // Documents
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/markdown",
  "text/html",
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  // Spreadsheets
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Presentations
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Code files
  "application/json",
  "text/javascript",
  "application/javascript",
  "text/x-python",
  "text/x-java",
  "text/x-c",
  "text/x-cpp",
  "text/x-typescript",
  "text/css",
  "text/xml",
  "application/xml",
  "text/x-yaml",
  "text/x-toml",
  "application/octet-stream", // fallback
];

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE, {
      message: `File size should be < ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    })
    .refine(
      (file) =>
        ALLOWED_MIME_TYPES.includes(file.type) ||
        file.type === "application/octet-stream",
      {
        message:
          "File type is not allowed. Please upload a supported file type.",
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
  if (!session) {
    logger.api.error("Unauthorized request to upload endpoint");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!request.body) {
    logger.upload.error("Empty request body received");
    return NextResponse.json({ error: "Request body is empty" }, { status: 400 });
  }

  try {
    logger.upload.info("Starting file upload process");
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      logger.upload.error("No file found in form data");
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    logger.upload.debug("File received", {
      filename: file.name,
      size: file.size,
      type: file.type,
    });

    const validatedFile = FileSchema.safeParse({ file });
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((e) => e.message)
        .join(", ");
      logger.upload.error("File validation failed", {
        errors: validatedFile.error.errors,
        filename: file.name,
      });
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const originalFilename = file.name;
    const rawMimeType = guessMimeType(originalFilename, file.type);

    logger.upload.debug("Resolved MIME type", {
      originalType: file.type,
      rawMimeType,
      filename: originalFilename,
    });

    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    // 1) Upload the RAW file
    const uniqueFilename = `${uuidv4()}.${originalFilename
      .split(".")
      .pop() || "bin"}`;
    logger.upload.info("Uploading raw file to blob storage", {
      uniqueFilename,
      contentType: rawMimeType,
    });

    const rawUploadData = await uploadBlob(uniqueFilename, buf, rawMimeType);

    // Prepare the "attachments" array for the response
    const attachments: Array<{
      url: string;
      name: string;
      contentType: string;
      isAzureExtractedJson?: boolean;
      associatedPdfName?: string;
      originalName?: string;
      pdfUrl?: string;
    }> = [
      {
        url: rawUploadData.url,
        name: originalFilename,
        contentType: rawMimeType,
      },
    ];

    // Process PDFs and text files
    if (rawMimeType === "application/pdf" || rawMimeType === "text/plain") {
      logger.upload.info(`Processing ${rawMimeType} file`, { filename: originalFilename });
      try {
        let processed;
        if (rawMimeType === "text/plain") {
          // For text files, simply read the content
          processed = {
            text: buf.toString('utf-8'),
            pages: 1,
            fileType: 'text/plain',
            language: 'Not specified',
            images: []
          };
        } else {
          // For PDFs, use Azure Document Intelligence
          processed = await processDocument(buf, rawMimeType, originalFilename);
        }

        // Convert extracted result to JSON
        const jsonFilename = `${uuidv4()}.json`;
        const docString = JSON.stringify({
          text: processed.text,
          metadata: {
            pages: processed.pages,
            fileType: processed.fileType,
            originalName: originalFilename,
            language: processed.language,
            images: processed.images,
          },
          url: rawUploadData.url
        });

        logger.upload.info("Uploading extracted text JSON to blob storage", {
          jsonFilename,
        });
        const jsonUploadData = await uploadBlob(
          jsonFilename,
          Buffer.from(docString),
          "application/json"
        );

        // Add second item to attachments with proper linking to original file
        attachments.push({
          url: jsonUploadData.url,
          name: jsonFilename,
          contentType: "application/json",
          isAzureExtractedJson: true,
          originalName: originalFilename,
          pdfUrl: rawMimeType === "application/pdf" ? rawUploadData.url : undefined
        });

        // Update the original file attachment to indicate it has associated JSON
        attachments[0].associatedPdfName = originalFilename;
      } catch (error) {
        logger.upload.error(`Failed to process ${rawMimeType} file`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        // We still return the raw file as a fallback
      }
    }

    logger.upload.info("File upload completed", {
      attachmentsCount: attachments.length,
    });

    return NextResponse.json(attachments, { status: 200 });
  } catch (error) {
    logger.upload.error("Request processing failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Failed to process file upload request" },
      { status: 500 }
    );
  }
}