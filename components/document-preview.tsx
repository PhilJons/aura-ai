'use client';

import {
  memo,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FileIcon, FullscreenIcon, ImageIcon, LoaderIcon } from './icons';
import { cn, fetcher } from '@/lib/utils';
import type { Document } from '@/lib/db/schema';
import { InlineDocumentSkeleton } from './document-skeleton';
import useSWR from 'swr';
import { Editor } from './editor';
import { DocumentToolCall, DocumentToolResult } from './document';
import { CodeEditor } from './code-editor';
import { SpreadsheetEditor } from './sheet-editor';
import { ImageEditor } from './image-editor';
import { debug } from '@/lib/utils/debug';
import { toast } from 'sonner';
import equal from 'fast-deep-equal';

interface DocumentPreviewProps {
  isReadonly: boolean;
  result?: any;
  args?: any;
  isCompact?: boolean;
}

interface DocumentState {
  documentId: string;
  title: string;
  kind: string;
  content: string;
  status: 'streaming' | 'idle';
  isVisible: boolean;
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

export function DocumentPreview({
  isReadonly,
  result,
  args,
  isCompact = true, // Default to compact mode for chat messages
}: DocumentPreviewProps) {
  const [documentState, setDocumentState] = useState<DocumentState>({
    documentId: '',
    title: '',
    kind: '',
    content: '',
    status: 'idle',
    isVisible: false,
    boundingBox: {
      top: 0,
      left: 0,
      width: 0,
      height: 0
    }
  });
  const compactButtonRef = useRef<HTMLButtonElement>(null);
  const expandedDivRef = useRef<HTMLDivElement>(null);
  const previousDocumentId = useRef<string | null>(null);

  debug('document', 'Document preview initialization', {
    resultId: result?.id,
    resultTitle: result?.title,
    resultKind: result?.kind,
    hasArgs: !!args,
    documentId: documentState.documentId,
    status: documentState.status,
    isReadonly,
    isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1,
    currentState: {
      isVisible: documentState.isVisible,
      content: `${documentState.content?.substring(0, 100)}...`,
      boundingBox: documentState.boundingBox
    }
  });

  // Memoize the document fetch key to prevent unnecessary re-fetches
  const documentFetchKey = useMemo(() => 
    result?.id ? `/api/document?id=${result.id}` : null,
    [result?.id]
  );

  const { data: documents, isLoading: isDocumentsFetching } = useSWR<Array<Document>>(
    documentFetchKey,
    fetcher,
    {
      revalidateOnFocus: false, // Prevent re-fetches on window focus
      dedupingInterval: 5000, // Dedupe requests within 5 seconds
      revalidateIfStale: false // Don't revalidate stale data automatically
    }
  );

  const previewDocument = useMemo(() => documents?.at(-1), [documents]);

  debug('document', 'Document data fetch state', {
    isDocumentsFetching,
    documentsLength: documents?.length,
    hasPreviewDocument: !!previewDocument,
    previewDocumentId: previewDocument?.id,
    previewDocumentTitle: previewDocument?.title,
    previewDocumentKind: previewDocument?.kind,
    previewDocumentContentLength: previewDocument?.content?.length,
    fetchUrl: documentFetchKey,
    isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
  });

  // Memoize the bounding box update function
  const updateBoundingBox = useCallback(() => {
    if (!documentState.documentId || isCompact) return;
    
    const boundingBox = expandedDivRef.current?.getBoundingClientRect();
    if (!boundingBox) return;
    
    setDocumentState(state => ({
      ...state,
      boundingBox: {
        left: boundingBox.x,
        top: boundingBox.y,
        width: boundingBox.width,
        height: boundingBox.height,
      },
    }));
  }, [documentState.documentId, isCompact]);

  useEffect(() => {
    updateBoundingBox();
  }, [updateBoundingBox]);

  // Handle document initialization
  useEffect(() => {
    if (result?.id && result.id !== previousDocumentId.current) {
      debug('document', 'Initializing document', {
        documentId: result.id,
        previousDocumentId: previousDocumentId.current,
        currentId: documentState.documentId,
        status: documentState.status
      });

      previousDocumentId.current = result.id;
    }
  }, [result?.id, documentState.documentId, documentState.status]);

  if (documentState.status === 'streaming') {
    debug('document', 'Document is streaming', {
      documentId: documentState.documentId,
      title: documentState.title,
      kind: documentState.kind,
      hasResult: !!result,
      hasArgs: !!args,
      resultId: result?.id,
      resultTitle: result?.title,
      resultKind: result?.kind,
      isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
    });

    if (result) {
      debug('document', 'Processing document tool result', {
        resultId: result.id,
        resultTitle: result.title,
        resultKind: result.kind,
        documentId: documentState.documentId,
        status: documentState.status,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });

      return (
        <DocumentToolResult
          type="update"
          result={{ id: result.id, title: result.title, kind: result.kind }}
          isReadonly={isReadonly}
        />
      );
    }

    if (args) {
      debug('document', 'Processing document tool call', {
        argsTitle: args.title,
        documentId: documentState.documentId,
        status: documentState.status,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });

      return (
        <DocumentToolCall
          type="create"
          args={{ title: args.title }}
          isReadonly={isReadonly}
        />
      );
    }
  }

  if (isDocumentsFetching) {
    debug('document', 'Loading document skeleton', {
      kind: result?.kind ?? args?.kind,
      documentId: result?.id,
      isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
    });
    return <LoadingSkeleton kind={result?.kind ?? args?.kind} isCompact={isCompact} />;
  }

  const document: Document | null = previewDocument
    ? previewDocument
    : documentState.status === 'streaming'
      ? {
          title: documentState.title,
          kind: documentState.kind,
          content: documentState.content,
          id: documentState.documentId,
          createdAt: new Date().toISOString(),
          userId: 'noop',
          type: 'document'
        }
      : null;

  debug('document', 'Resolved document for preview', {
    hasDocument: !!document,
    documentId: document?.id,
    documentTitle: document?.title,
    documentKind: document?.kind,
    documentContentLength: document?.content?.length,
    status: documentState.status,
    visibility: documentState.isVisible,
    isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1,
    resultId: result?.id,
    resultTitle: result?.title
  });

  if (!document) {
    debug('document', 'No document available, showing skeleton', {
      kind: documentState.kind,
      resultId: result?.id,
      argsId: args?.id,
      isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
    });
    return <LoadingSkeleton kind={documentState.kind} isCompact={isCompact} />;
  }

  if (isCompact) {
    return (
      <div className="relative w-full cursor-pointer">
        <button
          type="button"
          className="bg-background cursor-pointer border py-2 px-3 rounded-xl w-fit flex flex-row gap-3 items-start"
          onClick={(event) => {
            if (isReadonly) {
              toast.error(
                'Viewing files in shared chats is currently not supported.',
              );
              return;
            }

            const rect = event.currentTarget.getBoundingClientRect();

            const boundingBox = {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            };

            setDocumentState({
              documentId: document.id,
              kind: document.kind,
              content: document.content || '',
              title: document.title,
              status: 'idle',
              isVisible: true,
              boundingBox
            });
          }}
          ref={compactButtonRef}
        >
          <DocumentIcon kind={document.kind} />
          <div className="flex flex-col items-start gap-1">
            <div className="text-sm font-medium">{document.title}</div>
            <div className="text-xs text-muted-foreground">
              Click to view {document.kind}
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={expandedDivRef}
      className={cn(
        'fixed inset-4 z-50 bg-background rounded-xl border shadow-2xl flex flex-col',
        {
          'opacity-0 pointer-events-none': !documentState.isVisible,
          'opacity-100': documentState.isVisible,
        },
      )}
    >
      <DocumentHeader
        title={document.title}
        kind={document.kind}
        isStreaming={documentState.status === 'streaming'}
      />

      <div className="flex-1 overflow-hidden">
        {document.kind === 'code' && (
          <CodeEditor
            content={document.content || ''}
            onSaveContent={async (content: string) => {
              setDocumentState(state => ({
                ...state,
                content
              }));
            }}
            status={documentState.status}
            isCurrentVersion={true}
            currentVersionIndex={0}
            suggestions={[]}
          />
        )}

        {document.kind === 'text' && (
          <Editor
            content={document.content || ''}
            onSaveContent={async (content: string) => {
              setDocumentState(state => ({
                ...state,
                content
              }));
            }}
            status={documentState.status}
            isCurrentVersion={true}
            currentVersionIndex={0}
            suggestions={[]}
          />
        )}

        {document.kind === 'sheet' && (
          <SpreadsheetEditor
            content={document.content || ''}
            saveContent={async (content: string) => {
              setDocumentState(state => ({
                ...state,
                content
              }));
            }}
            status={documentState.status}
            isCurrentVersion={true}
            currentVersionIndex={0}
          />
        )}

        {document.kind === 'image' && (
          <ImageEditor
            content={document.content || ''}
            title={document.title}
            isCurrentVersion={true}
            currentVersionIndex={0}
            status={documentState.status}
            isInline={true}
          />
        )}
      </div>
    </div>
  );
}

const LoadingSkeleton = ({ kind, isCompact = true }: { kind: string; isCompact?: boolean }) => {
  if (isCompact) {
    return <InlineDocumentSkeleton />;
  }

  return (
    <div className="fixed inset-4 z-50 bg-background rounded-xl border shadow-2xl flex flex-col">
      <div className="flex flex-row items-center justify-between gap-4 p-4 border-b">
        <div className="flex flex-row items-center gap-3">
          <DocumentIcon kind={kind} />
          <div className="flex flex-col gap-1">
            <div className="h-5 w-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full w-full bg-muted animate-pulse" />
      </div>
    </div>
  );
};

const DocumentIcon = ({ kind }: { kind: string }) => {
  switch (kind) {
    case 'image':
      return <ImageIcon size={20} />;
    default:
      return <FileIcon size={20} />;
  }
};

const DocumentHeader = ({
  title,
  kind,
  isStreaming,
}: {
  title: string;
  kind: string;
  isStreaming: boolean;
}) => (
  <div className="flex flex-row items-center justify-between gap-4 p-4 border-b">
    <div className="flex flex-row items-center gap-3">
      <DocumentIcon kind={kind} />
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">
          {isStreaming ? 'Generating...' : kind}
        </div>
      </div>
    </div>

    <div className="flex flex-row items-center gap-2">
      {isStreaming && <div className="animate-spin"><LoaderIcon size={14} /></div>}
      <FullscreenIcon size={14} />
    </div>
  </div>
);
