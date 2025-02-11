import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, SASProtocol } from '@azure/storage-blob';

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

  // @ts-ignore - The types are incorrect, but this works
  const sasToken = generateBlobSASQueryParameters(sasOptions, blobServiceClient.credential).toString();
  
  return `${blobClient.url}?${sasToken}`;
}

export async function uploadBlob(
  filename: string,
  data: Buffer | ArrayBuffer,
  contentType: string
) {
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  
  await blockBlobClient.upload(data, data.byteLength, {
    blobHTTPHeaders: {
      blobContentType: contentType
    }
  });

  return {
    url: generateSasUrl(filename),
    pathname: filename,
    contentType
  };
}

export async function deleteBlob(filename: string) {
  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  await blockBlobClient.delete();
}