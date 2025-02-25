import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol } from '@azure/storage-blob';
import { logger } from '@/lib/utils/logger';

if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  logger.blob.error('Missing Azure Storage connection string environment variable');
  throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not set');
}

if (!process.env.AZURE_STORAGE_CONTAINER_NAME) {
  logger.blob.error('Missing Azure Storage container name environment variable');
  throw new Error('AZURE_STORAGE_CONTAINER_NAME environment variable is not set');
}

logger.blob.debug('Initializing Azure Blob Storage client', {
  containerName: process.env.AZURE_STORAGE_CONTAINER_NAME
});

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_STORAGE_CONTAINER_NAME
);

export function generateSasUrl(blobName: string): string {
  logger.blob.debug('Generating SAS URL', { 
    blobName,
    timestamp: new Date().toISOString()
  });
  
  const blobClient = containerClient.getBlobClient(blobName);
  
  // Create a SAS token that's valid for 24 hours
  const startsOn = new Date();
  const expiresOn = new Date(startsOn);
  expiresOn.setDate(startsOn.getDate() + 1);

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
    // @ts-ignore - The types are incorrect, but this works
    const sasToken = generateBlobSASQueryParameters(sasOptions, blobServiceClient.credential).toString();
    
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

// Generate a SAS token for direct uploads
export async function generateSasToken(blobName: string, contentType: string) {
  logger.blob.info('Generating SAS token for direct upload', {
    blobName,
    contentType,
    timestamp: new Date().toISOString()
  });

  try {
    const startTime = Date.now();
    const blobClient = containerClient.getBlobClient(blobName);
    
    // Create a SAS token that's valid for 30 minutes
    const startsOn = new Date();
    const expiresOn = new Date(startsOn);
    expiresOn.setMinutes(startsOn.getMinutes() + 30);

    const sasOptions = {
      containerName: containerClient.containerName,
      blobName: blobName,
      permissions: BlobSASPermissions.parse("cw"), // Create and Write permissions
      startsOn: startsOn,
      expiresOn: expiresOn,
      protocol: SASProtocol.Https
    };

    logger.blob.debug('SAS options prepared for direct upload', {
      containerName: sasOptions.containerName,
      blobName: sasOptions.blobName,
      permissions: 'create,write',
      expiresOn: sasOptions.expiresOn.toISOString(),
      timestamp: new Date().toISOString()
    });

    // @ts-ignore - The types are incorrect, but this works
    const sasToken = generateBlobSASQueryParameters(sasOptions, blobServiceClient.credential).toString();
    
    const sasUrl = `${blobClient.url}?${sasToken}`;
    const blobUrl = generateSasUrl(blobName); // This generates a read-only SAS URL
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.blob.info('SAS token for direct upload generated successfully', {
      blobName,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    return {
      sasUrl,
      blobUrl,
      containerName: containerClient.containerName,
      blobName
    };
  } catch (error) {
    logger.blob.error('Failed to generate SAS token', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      blobName,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export async function uploadBlob(
  filename: string,
  data: Buffer | ArrayBuffer,
  contentType: string
) {
  logger.blob.info('Starting blob upload', {
    filename,
    contentType,
    dataSize: data.byteLength,
    timestamp: new Date().toISOString()
  });

  try {
    const startTime = Date.now();
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    
    logger.blob.debug('Uploading to blob storage', {
      blobUrl: blockBlobClient.url,
      contentType,
      dataSize: data.byteLength,
      timestamp: new Date().toISOString()
    });

    const uploadStartTime = Date.now();
    const uploadResult = await blockBlobClient.upload(data, data.byteLength, {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    });
    const uploadEndTime = Date.now();
    const uploadDuration = uploadEndTime - uploadStartTime;
    
    logger.blob.debug('Blob upload completed', {
      filename,
      etag: uploadResult.etag,
      requestId: uploadResult.requestId,
      uploadDuration: `${uploadDuration}ms`,
      timestamp: new Date().toISOString()
    });

    const url = generateSasUrl(filename);
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    logger.blob.info('Blob upload completed successfully', {
      filename,
      url: url.substring(0, 50) + '...',
      uploadDuration: `${uploadDuration}ms`,
      totalDuration: `${totalDuration}ms`,
      timestamp: new Date().toISOString()
    });

    return {
      url,
      pathname: filename,
      contentType
    };
  } catch (error) {
    logger.blob.error('Blob upload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      filename,
      contentType,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

export async function deleteBlob(filename: string) {
  logger.blob.info('Deleting blob', { 
    filename,
    timestamp: new Date().toISOString()
  });

  try {
    const startTime = Date.now();
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    
    logger.blob.debug('Executing delete operation', {
      blobUrl: blockBlobClient.url,
      timestamp: new Date().toISOString()
    });
    
    const deleteResult = await blockBlobClient.delete();
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.blob.info('Blob deleted successfully', { 
      filename,
      requestId: deleteResult.requestId,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.blob.error('Failed to delete blob', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : 'No stack trace',
      filename,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}