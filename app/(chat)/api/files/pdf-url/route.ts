import { auth } from "@/app/(auth)/auth";
import { logger } from "@/lib/utils/logger";
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol } from "@azure/storage-blob";

export const maxDuration = 10; // 10 seconds should be plenty for generating a SAS URL

// Function to generate a SAS URL for a blob
function generateSasUrl(blobName: string): string {
  logger.blob.debug('Generating SAS URL', { 
    blobName,
    timestamp: new Date().toISOString()
  });
  
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('Storage connection string is not configured');
  }
  
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    connectionString
  );
  
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!containerName) {
    throw new Error('Storage container name is not configured');
  }
  
  const containerClient = blobServiceClient.getContainerClient(
    containerName
  );
  
  const blobClient = containerClient.getBlobClient(blobName);
  
  // Create a SAS token that's valid for 24 hours
  const startsOn = new Date();
  const expiresOn = new Date(startsOn);
  expiresOn.setDate(startsOn.getDate() + 1);

  // Extract account name and key from connection string
  const accountName = connectionString.match(/AccountName=([^;]+)/)?.[1] || '';
  const accountKey = connectionString.match(/AccountKey=([^;]+)/)?.[1] || '';
  
  if (!accountName || !accountKey) {
    throw new Error('Could not extract account name or key from connection string');
  }
  
  const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

  const sasOptions = {
    containerName: containerClient.containerName,
    blobName: blobName,
    permissions: BlobSASPermissions.parse("r"), // Read only
    startsOn: startsOn,
    expiresOn: expiresOn,
    protocol: SASProtocol.Https
  };

  logger.blob.debug('SAS options prepared', {
    containerName: sasOptions.containerName,
    blobName: sasOptions.blobName,
    permissions: 'read',
    expiresOn: sasOptions.expiresOn.toISOString(),
    timestamp: new Date().toISOString()
  });

  try {
    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential
    ).toString();
    
    const url = `${blobClient.url}?${sasToken}`;
    logger.blob.debug('SAS URL generated successfully', {
      blobName,
      urlLength: url.length,
      timestamp: new Date().toISOString()
    });
    
    return url;
  } catch (error) {
    logger.blob.error('Failed to generate SAS URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
      blobName,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

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

    logger.document.info('Generating SAS URL for PDF', {
      blobName,
      userId: session.user.id,
      environment: process.env.VERCEL_ENV || 'local',
      timestamp: new Date().toISOString()
    });

    if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
      return Response.json({ error: 'Storage connection string is not configured' }, { status: 500 });
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    
    if (!process.env.AZURE_STORAGE_CONTAINER_NAME) {
      return Response.json({ error: 'Storage container name is not configured' }, { status: 500 });
    }

    const containerClient = blobServiceClient.getContainerClient(
      process.env.AZURE_STORAGE_CONTAINER_NAME
    );

    // Extract account name and key from connection string
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      return Response.json({ error: 'Storage connection string is not configured' }, { status: 500 });
    }

    // Generate a SAS URL for the blob
    const sasUrl = generateSasUrl(blobName);
    
    logger.document.debug('SAS URL generated successfully', {
      blobName,
      sasUrl: `${sasUrl.substring(0, 50)}...`
    });

    return new Response(JSON.stringify({
      sasUrl
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
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