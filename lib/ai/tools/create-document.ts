import { generateUUID } from '@/lib/utils';
import { type DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import { blockKinds, documentHandlersByBlockKind } from '@/lib/blocks/server';
import { debug } from '@/lib/utils/debug';

interface CreateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const createDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      'Create a document for a writing or content creation activities. This tool will call other functions that will generate the contents of the document based on the title and kind.',
    parameters: z.object({
      title: z.string(),
      kind: z.enum(blockKinds),
    }),
    execute: async ({ title, kind }) => {
      // Feature temporarily disabled
      return {
        id: 'disabled',
        title: 'Feature Disabled',
        kind: kind,
        content: 'The Canvas Document Blocks feature is temporarily disabled.',
      };
      
      // Original implementation commented out
      /*
      const id = generateUUID();
      
      debug('document', 'Creating document:', {
        id,
        title,
        kind,
        userId: session.user?.id
      });

      // Send kind first
      dataStream.writeData({
        type: 'kind',
        content: kind,
      });

      // Then send the ID - this must match what we save to the database
      dataStream.writeData({
        type: 'id',
        content: id,
      });

      dataStream.writeData({
        type: 'title',
        content: title,
      });

      dataStream.writeData({
        type: 'clear',
        content: '',
      });

      const documentHandler = documentHandlersByBlockKind.find(
        (documentHandlerByBlockKind) =>
          documentHandlerByBlockKind.kind === kind,
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      await documentHandler.onCreateDocument({
        id, // Pass the same ID
        title,
        dataStream,
        session,
      });

      debug('document', 'Document created successfully:', {
        id,
        title,
        kind
      });

      dataStream.writeData({ type: 'finish', content: '' });

      return {
        id, // Return the same ID
        title,
        kind,
        content: 'A document was created and is now visible to the user.',
      };
      */
    },
  });
