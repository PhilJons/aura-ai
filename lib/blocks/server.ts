import type { DataStreamWriter } from 'ai';
import type { Document } from '../db/schema';
import { saveDocument } from '../db/queries';
import type { Session } from 'next-auth';
import { debug } from '@/lib/utils/debug';

export interface SaveDocumentProps {
  id: string;
  title: string;
  kind: string;
  content: string;
  userId: string;
}

export interface CreateDocumentCallbackProps {
  id: string;
  title: string;
  dataStream: DataStreamWriter;
  session: Session;
}

export interface UpdateDocumentCallbackProps {
  document: Document;
  description: string;
  dataStream: DataStreamWriter;
  session: Session;
}

export interface DocumentHandler {
  kind: string;
  onCreateDocument: (args: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<void>;
}

export function createDocumentHandler(config: {
  kind: string;
  onCreateDocument: (params: CreateDocumentCallbackProps) => Promise<string>;
  onUpdateDocument: (params: UpdateDocumentCallbackProps) => Promise<string>;
}): DocumentHandler {
  return {
    kind: config.kind,
    onCreateDocument: async (args: CreateDocumentCallbackProps) => {
      debug('document', 'Saving document:', {
        id: args.id,
        title: args.title,
        kind: config.kind,
        userId: args.session?.user?.id
      });

      const draftContent = await config.onCreateDocument({
        id: args.id,
        title: args.title,
        dataStream: args.dataStream,
        session: args.session,
      });

      if (args.session?.user?.id) {
        const savedDocument = await saveDocument({
          id: args.id,
          title: args.title,
          content: draftContent,
          kind: config.kind,
          userId: args.session.user.id,
        });

        debug('document', 'Document saved successfully:', {
          id: savedDocument.id,
          title: savedDocument.title,
          kind: savedDocument.kind
        });
      }

      return;
    },
    onUpdateDocument: async (args: UpdateDocumentCallbackProps) => {
      debug('document', 'Updating document:', {
        id: args.document.id,
        title: args.document.title,
        kind: config.kind,
        userId: args.session?.user?.id
      });

      const draftContent = await config.onUpdateDocument({
        document: args.document,
        description: args.description,
        dataStream: args.dataStream,
        session: args.session,
      });

      if (args.session?.user?.id) {
        const savedDocument = await saveDocument({
          id: args.document.id,
          title: args.document.title,
          content: draftContent,
          kind: config.kind,
          userId: args.session.user.id,
        });

        debug('document', 'Document updated successfully:', {
          id: savedDocument.id,
          title: savedDocument.title,
          kind: savedDocument.kind
        });
      }

      return;
    },
  };
}

/*
 * Use this array to define the document handlers.
 */
export const documentHandlers: Array<DocumentHandler> = [];
