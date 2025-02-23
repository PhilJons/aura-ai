import { v4 as uuidv4 } from 'uuid';
import { processDocument } from '@/lib/azure/document';
import { uploadBlob } from '@/lib/azure/blob';

export async function uploadFile(file: File) {
  const originalFilename = file.name;
  const rawMimeType = file.type;

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // 1) Upload the RAW file - include original filename in the path
  const uniqueId = uuidv4();
  const uniqueFilename = `${uniqueId}-${originalFilename}`;
  const rawUploadData = await uploadBlob(uniqueFilename, buf, rawMimeType);

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
    return attachments;
  }

  // Process PDFs and text files
  if (rawMimeType === 'application/pdf' || rawMimeType === 'text/plain') {
    try {
      let processed;
      if (rawMimeType === 'text/plain') {
        // For text files, simply read the content
        processed = {
          text: buf.toString('utf-8'),
          pages: 1,
          fileType: 'text/plain',
          language: 'Not specified',
          images: []
        };
      } else {
        // For PDFs, use Azure Document Intelligence
        processed = await processDocument(buf, rawMimeType, originalFilename);
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

      const jsonUploadData = await uploadBlob(
        jsonFilename,
        Buffer.from(docString),
        'application/json'
      );

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
      console.error(`Failed to process ${rawMimeType} file:`, error);
      // We still return the raw file as a fallback
    }
  }

  return attachments;
} 