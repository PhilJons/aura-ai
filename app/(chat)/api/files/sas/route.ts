import { auth } from "@/app/(auth)/auth";
import { logger } from "@/lib/utils/logger";
import { generateSasToken } from "@/lib/azure/blob";

export const maxDuration = 10; // 10 seconds should be plenty for generating a SAS token

export async function POST(request: Request) {
  logger.upload.debug('SAS token generation route called', {
    environment: process.env.VERCEL_ENV || 'local',
    timestamp: new Date().toISOString()
  });

  const session = await auth();

  if (!session || !session.user) {
    logger.upload.info('Unauthorized access attempt to SAS token route', {
      environment: process.env.VERCEL_ENV || 'local'
    });
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const requestBody = await request.json();
    logger.upload.debug('SAS token request body received', {
      requestBody: JSON.stringify(requestBody),
      userId: session.user.id
    });
    
    const { filename, contentType } = requestBody;

    if (!filename) {
      logger.upload.info('Missing filename in SAS token request', {
        userId: session.user.id
      });
      return new Response(JSON.stringify({ error: 'Filename is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!contentType) {
      logger.upload.info('Missing content type in SAS token request', {
        userId: session.user.id,
        filename
      });
      return new Response(JSON.stringify({ error: 'Content type is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.upload.info('Generating SAS token for direct upload', {
      filename,
      contentType,
      userId: session.user.id,
      environment: process.env.VERCEL_ENV || 'local',
      timestamp: new Date().toISOString()
    });

    // Generate a unique blob name to prevent collisions
    const uniqueId = crypto.randomUUID();
    const blobName = `${uniqueId}-${filename}`;
    logger.upload.debug('Generated unique blob name', {
      originalFilename: filename,
      blobName,
      uniqueId
    });

    // Generate a SAS token for the blob
    logger.upload.debug('Calling generateSasToken function', {
      blobName,
      contentType
    });
    
    const sasData = await generateSasToken(blobName, contentType);
    
    logger.upload.debug('SAS token generated successfully', {
      blobName,
      sasUrl: `${sasData.sasUrl.substring(0, 50)}...`,
      blobUrl: `${sasData.blobUrl.substring(0, 50)}...`,
      containerName: sasData.containerName
    });

    logger.upload.info('SAS token generated successfully', {
      blobName,
      sasUrl: `${sasData.sasUrl.substring(0, 50)}...`, // Log only part of the URL for security
      timestamp: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      sasUrl: sasData.sasUrl,
      blobName: blobName,
      containerName: sasData.containerName,
      blobUrl: sasData.blobUrl
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.upload.error('Error generating SAS token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      environment: process.env.VERCEL_ENV || 'local',
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        error: 'Failed to generate SAS token',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
} 