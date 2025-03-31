import { auth } from "@/app/(auth)/auth";
import { logger } from "@/lib/utils/logger";
import { processDocument } from "@/lib/azure/document";
import { uploadBlob, generateSasUrl } from "@/lib/azure/blob";
import { markFileUploadStarted, markFileUploadComplete } from '@/lib/utils/stream';
import { BlobServiceClient } from "@azure/storage-blob";

export const maxDuration = 60; // 60 seconds for processing

export async function POST(request: Request) {
  const session = await auth();
  
  logger.upload.debug('Process route called', {
    environment: process.env.VERCEL_ENV || 'local',
    timestamp: new Date().toISOString()
  });

  if (!session || !session.user) {
    logger.upload.info('Unauthorized access attempt to process route', {
      environment: process.env.VERCEL_ENV || 'local'
    });
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const requestBody = await request.json();
    logger.upload.debug('Request body received', {
      requestBody: JSON.stringify(requestBody),
      userId: session.user.id
    });
    
    const { blobName, contentType, originalFilename, chatId } = requestBody;

    if (!blobName || !contentType || !originalFilename || !chatId) {
      const missingFields = [];
      if (!blobName) missingFields.push('blobName');
      if (!contentType) missingFields.push('contentType');
      if (!originalFilename) missingFields.push('originalFilename');
      if (!chatId) missingFields.push('chatId');
      
      logger.upload.info('Missing required fields in process request', {
        missingFields,
        userId: session.user.id
      });
      
      return new Response(JSON.stringify({ 
        error: 'Missing required fields', 
        details: `${missingFields.join(', ')} are required` 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.upload.info('Processing directly uploaded file', {
      blobName,
      contentType,
      originalFilename,
      chatId,
      userId: session.user.id,
      environment: process.env.VERCEL_ENV || 'local',
      timestamp: new Date().toISOString()
    });

    // Mark upload started
    markFileUploadStarted(chatId);
    logger.upload.debug('Marked file upload as started', { chatId });

    try {
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
          url: generateSasUrl(blobName),
          name: originalFilename,
          contentType: contentType,
          originalName: originalFilename
        },
      ];
      
      logger.upload.debug('Initial attachment created', {
        url: `${attachments[0].url.substring(0, 50)}...`,
        name: attachments[0].name,
        contentType: attachments[0].contentType
      });

      // For PDFs, process with Document Intelligence
      if (contentType === 'application/pdf') {
        logger.document.info('Starting document processing for directly uploaded PDF', {
          blobName,
          originalFilename,
          environment: process.env.VERCEL_ENV || 'local',
          timestamp: new Date().toISOString()
        });

        try {
          // Download the blob to process it
          logger.document.debug('Initializing blob service client', {
            blobName
          });
          
          const blobServiceClient = BlobServiceClient.fromConnectionString(
            process.env.AZURE_STORAGE_CONNECTION_STRING!
          );
          const containerClient = blobServiceClient.getContainerClient(
            process.env.AZURE_STORAGE_CONTAINER_NAME!
          );
          const blockBlobClient = containerClient.getBlockBlobClient(blobName);
          
          logger.document.debug('Starting blob download', {
            blobName,
            blobUrl: `${blockBlobClient.url.substring(0, 50)}...`
          });
          
          // Download the blob
          const downloadResponse = await blockBlobClient.download(0);
          logger.document.debug('Blob download response received', {
            blobName,
            contentLength: downloadResponse.contentLength
          });
          
          const chunks: any[] = [];
          
          logger.document.debug('Starting to read blob stream', {
            blobName
          });
          
          // @ts-ignore - The types are incorrect, but this works
          for await (const chunk of downloadResponse.readableStreamBody) {
            chunks.push(chunk);
          }
          
          const buffer = Buffer.concat(chunks);
          logger.document.debug('Blob download complete', {
            blobName,
            bufferSize: buffer.byteLength
          });
          
          // Process the PDF
          logger.document.debug('Starting document processing', {
            blobName,
            bufferSize: buffer.byteLength
          });
          
          const processed = await processDocument(buffer, contentType, originalFilename);
          
          logger.document.info('PDF processed successfully', {
            originalFilename,
            pages: processed.pages,
            textLength: processed.text.length,
            timestamp: new Date().toISOString()
          });

          // Convert extracted result to JSON
          const jsonFilename = `${blobName}.json`;
          logger.document.debug('Creating JSON from processed document', {
            jsonFilename,
            textLength: processed.text.length
          });
          
          const pdfUrl = generateSasUrl(blobName);
          
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
            pdfUrl: pdfUrl
          });

          // Upload the JSON
          logger.document.debug('Uploading JSON to blob storage', {
            jsonFilename,
            jsonSize: docString.length
          });
          
          const jsonUploadData = await uploadBlob(
            jsonFilename,
            Buffer.from(docString),
            'application/json'
          );
          
          logger.document.debug('JSON upload complete', {
            jsonFilename,
            jsonUrl: `${jsonUploadData.url.substring(0, 50)}...`,
            pdfUrl: pdfUrl
          });
          
          // Add second item to attachments with proper linking to original file
          attachments.push({
            url: jsonUploadData.url,
            name: originalFilename,
            contentType: 'application/json',
            isAzureExtractedJson: true,
            originalName: originalFilename,
            pdfUrl: pdfUrl
          });
          
          logger.document.debug('Added JSON attachment', {
            attachmentCount: attachments.length,
            pdfUrl: pdfUrl
          });

          // Update the original file attachment to indicate it has associated JSON
          attachments[0].associatedPdfName = originalFilename;
          attachments[0].pdfUrl = pdfUrl;
          logger.document.debug('Updated original attachment with association', {
            associatedPdfName: attachments[0].associatedPdfName,
            pdfUrl: attachments[0].pdfUrl
          });
        } catch (processingError) {
          logger.document.error('Error processing PDF', {
            error: processingError instanceof Error ? processingError.message : 'Unknown error',
            errorName: processingError instanceof Error ? processingError.name : 'Unknown',
            errorStack: processingError instanceof Error ? processingError.stack : 'No stack trace',
            blobName,
            originalFilename,
            timestamp: new Date().toISOString()
          });
          // We still return the raw file as a fallback
          logger.document.info('Returning raw PDF as fallback', {
            blobName
          });
        }
      }

      // Mark upload complete
      markFileUploadComplete(chatId);
      logger.upload.debug('Marked file upload as complete', { chatId });

      logger.upload.info('File processing completed successfully', {
        blobName,
        originalFilename,
        attachmentCount: attachments.length,
        timestamp: new Date().toISOString()
      });

      return new Response(JSON.stringify(attachments), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Make sure to mark upload complete even on error
      markFileUploadComplete(chatId);
      logger.upload.debug('Marked file upload as complete (after error)', { chatId });
      
      logger.upload.error('Error processing file', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack : 'No stack trace',
        blobName,
        originalFilename,
        environment: process.env.VERCEL_ENV || 'local',
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  } catch (error) {
    logger.upload.error('File processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      environment: process.env.VERCEL_ENV || 'local',
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process file', 
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
} 