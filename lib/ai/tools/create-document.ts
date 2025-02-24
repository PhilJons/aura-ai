import { type DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';

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
      kind: z.string(),
    }),
    execute: async ({ title, kind }) => {
      return {
        id: 'disabled',
        title: 'Feature Disabled',
        kind: kind,
        content: 'The Canvas Document Blocks feature is temporarily disabled.',
      };
    },
  });
