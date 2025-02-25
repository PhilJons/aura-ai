import { auth } from "@/app/(auth)/auth";
import { logger } from "@/lib/utils/logger";
import { BlobServiceClient } from "@azure/storage-blob";
import { markFileUploadComplete } from '@/lib/utils/stream';

export const maxDuration = 10; // 10 seconds for cleanup

export async function POST(request: Request) {
  const session = await auth();
  
  logger.upload.debug('Cleanup route called', {
    environment: process.env.VERCEL_ENV || 'local',
    timestamp: new Date().toISOString()
  });

  if (!session || !session.user) {
    logger.upload.info('Unauthorized access attempt to cleanup route', {
      environment: process.env.VERCEL_ENV || 'local'
    });
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const requestBody = await request.json();
    logger.upload.debug('Cleanup request body received', {
      requestBody: JSON.stringify(requestBody),
      userId: session.user.id
    });

    const { blobName, chatId } = requestBody;

    if (!blobName) {
      logger.upload.error('Missing blobName in cleanup request', {
        userId: session.user.id
      });
      return new Response(JSON.stringify({ error: 'Missing blobName' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Initialize the blob service client
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'ai-chatbot-files';
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING || ''
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Try to delete the original blob
    try {
      const blobClient = containerClient.getBlobClient(blobName);
      await blobClient.deleteIfExists();
      logger.upload.info('Original blob deleted', { blobName });
    } catch (error) {
      logger.upload.error('Error deleting original blob', {
        blobName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Continue with cleanup even if this fails
    }

    // Try to delete the associated JSON blob
    try {
      const jsonBlobName = `${blobName}.json`;
      const jsonBlobClient = containerClient.getBlobClient(jsonBlobName);
      await jsonBlobClient.deleteIfExists();
      logger.upload.info('JSON blob deleted', { jsonBlobName });
    } catch (error) {
      logger.upload.error('Error deleting JSON blob', {
        jsonBlobName: `${blobName}.json`,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Continue with cleanup even if this fails
    }

    // Mark the file upload as complete to clean up any pending UI states
    if (chatId) {
      markFileUploadComplete(chatId);
    }

    logger.upload.info('Cleanup completed successfully', {
      blobName,
      chatId,
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    logger.upload.error('Error in cleanup route', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 