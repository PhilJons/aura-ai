import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol } from '@azure/storage-blob';
import { logger } from '@/lib/utils/logger';

if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not set');
}

if (!process.env.AZURE_STORAGE_CONTAINER_NAME) {
  throw new Error('AZURE_STORAGE_CONTAINER_NAME environment variable is not set');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);

const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_STORAGE_CONTAINER_NAME
);

function generateSasUrl(blobName: string): string {
  logger.blob.debug('Generating SAS URL', { blobName });
  
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
    expiresOn: sasOptions.expiresOn.toISOString()
  });

  // @ts-ignore - The types are incorrect, but this works
  const sasToken = generateBlobSASQueryParameters(sasOptions, blobServiceClient.credential).toString();
  
  const url = `${blobClient.url}?${sasToken}`;
  logger.blob.debug('SAS URL generated successfully');
  
  return url;
}

export async function uploadBlob(
  filename: string,
  data: Buffer | ArrayBuffer,
  contentType: string
) {
  logger.blob.info('Starting blob upload', {
    filename,
    contentType,
    dataSize: data.byteLength
  });

  try {
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    
    logger.blob.debug('Uploading to blob storage', {
      blobUrl: blockBlobClient.url,
      contentType
    });

    await blockBlobClient.upload(data, data.byteLength, {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    });

    const url = generateSasUrl(filename);
    
    logger.blob.info('Blob upload completed successfully', {
      filename,
      url
    });

    return {
      url,
      pathname: filename,
      contentType
    };
  } catch (error) {
    logger.blob.error('Blob upload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      filename,
      contentType
    });
    throw error;
  }
}

export async function deleteBlob(filename: string) {
  logger.blob.info('Deleting blob', { filename });

  try {
    const blockBlobClient = containerClient.getBlockBlobClient(filename);
    await blockBlobClient.delete();
    logger.blob.info('Blob deleted successfully', { filename });
  } catch (error) {
    logger.blob.error('Failed to delete blob', {
      error: error instanceof Error ? error.message : 'Unknown error',
      filename
    });
    throw error;
  }
}