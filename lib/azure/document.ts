import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { logger } from "@/lib/utils/logger";

/*
<ai_context>
  This module defines processDocument, which extracts text (and optional images)
  from the file using Azure Document Intelligence, returning the processed content.
  We do NOT overwrite the PDF's original file with JSON.
  Instead, we only return the extracted data from the analysis.
</ai_context>
*/

if (!process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT) {
  throw new Error("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT is not set");
}

if (!process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY) {
  throw new Error("AZURE_DOCUMENT_INTELLIGENCE_KEY is not set");
}

const client = new DocumentAnalysisClient(
  process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
  new AzureKeyCredential(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY)
);

export interface ProcessedDocument {
  text: string;
  pages: number;
  language?: string;
  fileType: string;
  images?: Array<{
    url?: string;
    name?: string;
    contentType?: string;
  }>;
}

export async function processDocument(
  buffer: Buffer | ArrayBuffer,
  mimeType: string,
  filename: string
): Promise<ProcessedDocument> {
  logger.document.info("Starting document processing", { mimeType, filename });

  try {
    const documentBuffer =
      buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer;

    logger.document.debug("Buffer prepared for analysis", {
      bufferSize: documentBuffer.length,
      isArrayBuffer: buffer instanceof ArrayBuffer,
    });

    const poller = await client.beginAnalyzeDocument(
      "prebuilt-document",
      documentBuffer
    );
    logger.document.debug("Waiting for analysis to complete...");
    const result = await poller.pollUntilDone();

    if (!result) {
      logger.document.error("Document analysis failed - no result returned");
      throw new Error("Document analysis failed");
    }

    logger.document.debug("Analysis completed", {
      pageCount: result.pages?.length,
      paragraphCount: result.paragraphs?.length,
      languages: result.languages,
    });

    // Extract text content, joining paragraphs with double newlines for better readability
    const content = result.paragraphs?.map((p) => p.content).join("\n\n") || "";

    // Log the first 100 characters of content for debugging
    logger.document.debug("Extracted content preview", {
      contentPreview: `${content.substring(0, 100)}...`,
      totalLength: content.length
    });

    const processedDoc: ProcessedDocument = {
      text: content,
      pages: result.pages?.length || 1,
      language: result.languages?.[0]?.locale,
      fileType: mimeType,
      images: []
    };

    logger.document.info("Document processing completed successfully", {
      pages: processedDoc.pages,
      language: processedDoc.language,
      textLength: processedDoc.text.length,
      imageCount: processedDoc.images?.length,
    });

    return processedDoc;
  } catch (error) {
    logger.document.error("Error processing document", {
      error: error instanceof Error ? error.message : "Unknown error",
      mimeType,
      filename,
    });
    throw new Error("Failed to process document");
  }
}