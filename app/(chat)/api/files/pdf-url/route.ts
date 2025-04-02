import { auth } from "@/app/(auth)/auth";
import { logger } from "@/lib/utils/logger";
import { generateSasUrl } from '@/lib/azure/blob';

export const maxDuration = 10; // 10 seconds should be plenty for generating a SAS URL

export async function POST(request: Request) {
  logger.document.debug('PDF URL generation route called', {
    environment: process.env.VERCEL_ENV || 'local',
    timestamp: new Date().toISOString()
  });

  const session = await auth();

  if (!session || !session.user) {
    logger.document.info('Unauthorized access attempt to PDF URL route', {
      environment: process.env.VERCEL_ENV || 'local'
    });
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const requestBody = await request.json();
    logger.document.debug('PDF URL request body received', {
      requestBody: JSON.stringify(requestBody),
      userId: session.user.id
    });
    
    const { blobName } = requestBody;

    if (!blobName) {
      logger.document.info('Missing blobName in PDF URL request', {
        userId: session.user.id
      });
      return new Response(JSON.stringify({ error: 'Blob name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if blobName is URL encoded and decode it if needed
    const decodedBlobName = blobName.includes('%') ? decodeURIComponent(blobName) : blobName;
    
    logger.document.info('Generating SAS URL for PDF', {
      blobName: decodedBlobName,
      userId: session.user.id,
      environment: process.env.VERCEL_ENV || 'local',
      timestamp: new Date().toISOString()
    });

    // Generate a SAS URL for the blob using the shared implementation
    try {
      const sasUrl = generateSasUrl(decodedBlobName);
      
      logger.document.debug('SAS URL generated successfully', {
        blobName: decodedBlobName,
        sasUrl: `${sasUrl.substring(0, 50)}...`
      });

      return new Response(JSON.stringify({
        sasUrl
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (sasError) {
      logger.document.error('Error in SAS URL generation', {
        error: sasError instanceof Error ? sasError.message : 'Unknown error',
        errorName: sasError instanceof Error ? sasError.name : 'Unknown',
        errorStack: sasError instanceof Error ? sasError.stack : 'No stack trace',
        blobName: decodedBlobName,
        timestamp: new Date().toISOString()
      });
      
      throw sasError;
    }
  } catch (error) {
    logger.document.error('Error generating PDF SAS URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      environment: process.env.VERCEL_ENV || 'local',
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        error: 'Failed to generate PDF SAS URL',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
} 