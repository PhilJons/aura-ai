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
    fileSize: file.size
  });

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // 1) Upload the RAW file - include original filename in the path
  const uniqueId = uuidv4();
  const uniqueFilename = `${uniqueId}-${originalFilename}`;
  
  logger.upload.debug('Uploading raw file to blob storage', {
    uniqueFilename,
    size: buf.length
  });
  
  const rawUploadData = await uploadBlob(uniqueFilename, buf, rawMimeType);
  
  logger.upload.debug('Raw file uploaded successfully', {
    url: rawUploadData.url
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
          fileSize: buf.length
        });
        
        // Set a timeout for PDF processing to prevent hanging
        const processingPromise = processDocument(buf, rawMimeType, originalFilename);
        
        try {
          processed = await processingPromise;
          
          logger.upload.info('PDF processed successfully', {
            filename: originalFilename,
            pages: processed.pages,
            textLength: processed.text.length
          });
        } catch (error) {
          logger.upload.error('PDF processing failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            filename: originalFilename
          });
          
          // Return the raw file attachment as a fallback
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
        jsonSize: docString.length
      });

      const jsonUploadData = await uploadBlob(
        jsonFilename,
        Buffer.from(docString),
        'application/json'
      );
      
      logger.upload.debug('JSON uploaded successfully', {
        url: jsonUploadData.url
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
        filename: originalFilename
      });
      // We still return the raw file as a fallback
    }
  }

  logger.upload.info('File upload process completed', {
    filename: originalFilename,
    attachmentCount: attachments.length
  });

  return attachments;
} 