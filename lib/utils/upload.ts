import { v4 as uuidv4 } from 'uuid';
import { processDocument, type ProcessedDocument } from '@/lib/azure/document';
import { uploadBlob } from '@/lib/azure/blob';
import { logger } from '@/lib/utils/logger';

export async function uploadFile(file: File) {
  const originalFilename = file.name;
  const rawMimeType = file.type;

  logger.upload.info('Starting file upload process', {
    filename: originalFilename,
    mimeType: rawMimeType,
    fileSize: file.size,
    fileSizeInMB: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
    environment: process.env.VERCEL_ENV || 'local'
  });

  try {
    const arrayBuf = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    logger.upload.debug('File converted to buffer successfully', {
      filename: originalFilename,
      bufferSize: buf.length,
      bufferSizeInMB: `${(buf.length / (1024 * 1024)).toFixed(2)}MB`
    });

    // 1) Upload the RAW file - include original filename in the path
    const uniqueId = uuidv4();
    const uniqueFilename = `${uniqueId}-${originalFilename}`;
    
    logger.upload.debug('Uploading raw file to blob storage', {
      uniqueFilename,
      size: buf.length,
      sizeInMB: `${(buf.length / (1024 * 1024)).toFixed(2)}MB`
    });
    
    const rawUploadData = await uploadBlob(uniqueFilename, buf, rawMimeType);
    
    logger.upload.debug('Raw file uploaded successfully', {
      url: rawUploadData.url,
      filename: originalFilename
    });

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
        originalName: originalFilename
      },
    ];

    // For images, we don't need to process them further since GPT-4o can handle them directly
    if (rawMimeType.startsWith('image/')) {
      logger.upload.info('Image file processed successfully', {
        filename: originalFilename
      });
      return attachments;
    }

    // Process PDFs and text files
    if (rawMimeType === 'application/pdf' || rawMimeType === 'text/plain') {
      try {
        let processed: ProcessedDocument;
        
        if (rawMimeType === 'text/plain') {
          // For text files, simply read the content
          logger.upload.debug('Processing text file', {
            filename: originalFilename
          });
          
          processed = {
            text: buf.toString('utf-8'),
            pages: 1,
            fileType: 'text/plain',
            language: 'Not specified',
            images: []
          };
          
          logger.upload.debug('Text file processed successfully', {
            textLength: processed.text.length
          });
        } else {
          // For PDFs, use Azure Document Intelligence
          logger.upload.info('Starting PDF processing with Azure Document Intelligence', {
            filename: originalFilename,
            fileSize: buf.length,
            fileSizeInMB: `${(buf.length / (1024 * 1024)).toFixed(2)}MB`,
            environment: process.env.VERCEL_ENV || 'local'
          });
          
          // Set a timeout for PDF processing to prevent hanging
          const processingPromise = processDocument(buf, rawMimeType, originalFilename);
          
          try {
            logger.upload.debug('Awaiting Document Intelligence processing result', {
              filename: originalFilename,
              timestamp: new Date().toISOString()
            });
            
            processed = await processingPromise;
            
            logger.upload.info('PDF processed successfully by Document Intelligence', {
              filename: originalFilename,
              pages: processed.pages,
              textLength: processed.text.length,
              textPreview: `${processed.text.substring(0, 100)}...`,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            logger.upload.error('PDF processing failed in Document Intelligence', {
              error: error instanceof Error ? error.message : 'Unknown error',
              errorName: error instanceof Error ? error.name : 'Unknown',
              errorStack: error instanceof Error ? error.stack : 'No stack trace',
              filename: originalFilename,
              timestamp: new Date().toISOString(),
              environment: process.env.VERCEL_ENV || 'local'
            });
            
            // Return the raw file attachment as a fallback
            logger.upload.info('Returning raw PDF as fallback due to processing failure', {
              filename: originalFilename
            });
            return attachments;
          }
        }

        // Convert extracted result to JSON - include original filename in JSON name
        const jsonFilename = `${uniqueId}-${originalFilename}.json`;
        const docString = JSON.stringify({
          text: processed.text,
          metadata: {
            pages: processed.pages,
            fileType: processed.fileType,
            originalName: originalFilename,
            language: processed.language,
            images: processed.images,
          },
          originalName: originalFilename,
          pdfUrl: rawMimeType === 'application/pdf' ? rawUploadData.url : undefined
        });

        logger.upload.debug('Uploading processed document JSON to blob storage', {
          jsonFilename,
          jsonSize: docString.length,
          jsonSizeInMB: `${(docString.length / (1024 * 1024)).toFixed(2)}MB`
        });

        const jsonUploadData = await uploadBlob(
          jsonFilename,
          Buffer.from(docString),
          'application/json'
        );
        
        logger.upload.debug('JSON uploaded successfully', {
          url: jsonUploadData.url,
          jsonFilename,
          pdfUrl: rawMimeType === 'application/pdf' ? rawUploadData.url : undefined
        });

        // Add second item to attachments with proper linking to original file
        attachments.push({
          url: jsonUploadData.url,
          name: originalFilename,
          contentType: 'application/json',
          isAzureExtractedJson: true,
          originalName: originalFilename,
          pdfUrl: rawMimeType === 'application/pdf' ? rawUploadData.url : undefined
        });

        // Update the original file attachment to indicate it has associated JSON
        attachments[0].associatedPdfName = originalFilename;
      } catch (error) {
        logger.upload.error(`Failed to process ${rawMimeType} file:`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorStack: error instanceof Error ? error.stack : 'No stack trace',
          filename: originalFilename,
          environment: process.env.VERCEL_ENV || 'local'
        });
        // We still return the raw file as a fallback
        logger.upload.info('Returning raw file as fallback due to processing failure', {
          filename: originalFilename
        });
      }
    }

    logger.upload.info('File upload process completed', {
      filename: originalFilename,
      attachmentCount: attachments.length,
      timestamp: new Date().toISOString()
    });

    return attachments;
  } catch (error) {
    logger.upload.error('Unexpected error in uploadFile function', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      filename: originalFilename,
      environment: process.env.VERCEL_ENV || 'local'
    });
    throw error; // Re-throw to be handled by the caller
  }
} 