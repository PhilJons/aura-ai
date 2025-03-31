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

// Maximum time to wait for document processing (in milliseconds)
const MAX_PROCESSING_TIME = 45000; // 45 seconds

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

// Helper function to add timeout to promises
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    })
  ]);
}

export async function processDocument(
  buffer: Buffer | ArrayBuffer,
  mimeType: string,
  filename: string
): Promise<ProcessedDocument> {
  logger.document.info("Starting document processing", { 
    mimeType, 
    filename,
    bufferSize: buffer.byteLength,
    bufferSizeInMB: `${(buffer.byteLength / (1024 * 1024)).toFixed(2)}MB`,
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'local'
  });

  try {
    const documentBuffer =
      buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer;

    logger.document.debug("Buffer prepared for analysis", {
      bufferSize: documentBuffer.length,
      bufferSizeInMB: `${(documentBuffer.length / (1024 * 1024)).toFixed(2)}MB`,
      isArrayBuffer: buffer instanceof ArrayBuffer,
      timestamp: new Date().toISOString()
    });

    logger.document.debug("Initializing Document Intelligence client", {
      endpoint: `${process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.substring(0, 20)}...`,
      timestamp: new Date().toISOString()
    });

    logger.document.debug("Starting document analysis", {
      filename,
      timestamp: new Date().toISOString()
    });

    const poller = await client.beginAnalyzeDocument(
      "prebuilt-document",
      documentBuffer
    );
    
    logger.document.debug("Analysis started, polling for results", {
      filename,
      timestamp: new Date().toISOString()
    });
    
    // Add timeout to the polling operation
    logger.document.debug("Setting timeout for document analysis", {
      timeoutMs: MAX_PROCESSING_TIME,
      filename,
      timestamp: new Date().toISOString()
    });
    
    const result = await withTimeout(
      poller.pollUntilDone(),
      MAX_PROCESSING_TIME,
      `Document analysis timed out after ${MAX_PROCESSING_TIME / 1000} seconds`
    );

    if (!result) {
      logger.document.error("Document analysis failed - no result returned", {
        filename,
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || 'local'
      });
      throw new Error("Document analysis failed");
    }

    logger.document.debug("Analysis completed", {
      pageCount: result.pages?.length,
      paragraphCount: result.paragraphs?.length,
      languages: result.languages,
      timestamp: new Date().toISOString()
    });

    // Extract text content, joining paragraphs with double newlines for better readability
    const content = result.paragraphs?.map((p) => p.content).join("\n\n") || "";

    // Log the first 100 characters of content for debugging
    logger.document.debug("Extracted content preview", {
      contentPreview: `${content.substring(0, 100)}...`,
      totalLength: content.length,
      timestamp: new Date().toISOString()
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
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'local'
    });

    return processedDoc;
  } catch (error) {
    logger.document.error("Error processing document", {
      error: error instanceof Error ? error.message : "Unknown error",
      errorName: error instanceof Error ? error.name : "Unknown",
      errorStack: error instanceof Error ? error.stack : "No stack trace",
      mimeType,
      filename,
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV || 'local'
    });
    throw new Error("Failed to process document");
  }
}