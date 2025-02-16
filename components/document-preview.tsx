'use client';

import {
  memo,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { BlockKind, UIBlock } from './block';
import { FileIcon, FullscreenIcon, ImageIcon, LoaderIcon } from './icons';
import { cn, fetcher } from '@/lib/utils';
import type { Document } from '@/lib/db/schema';
import { InlineDocumentSkeleton } from './document-skeleton';
import useSWR from 'swr';
import { Editor } from './editor';
import { DocumentToolCall, DocumentToolResult } from './document';
import { CodeEditor } from './code-editor';
import { useBlock } from '@/hooks/use-block';
import equal from 'fast-deep-equal';
import { SpreadsheetEditor } from './sheet-editor';
import { ImageEditor } from './image-editor';
import { debug } from '@/lib/utils/debug';

interface DocumentPreviewProps {
  isReadonly: boolean;
  result?: any;
  args?: any;
}

export function DocumentPreview({
  isReadonly,
  result,
  args,
}: DocumentPreviewProps) {
  const { block, setBlock } = useBlock();
  const hitboxRef = useRef<HTMLDivElement>(null);

  debug('document', 'Document preview initialization', {
    resultId: result?.id,
    resultTitle: result?.title,
    resultKind: result?.kind,
    hasArgs: !!args,
    blockId: block.documentId,
    blockStatus: block.status,
    isReadonly,
    isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1,
    currentBlockState: {
      isVisible: block.isVisible,
      content: block.content?.substring(0, 100) + '...',
      boundingBox: block.boundingBox
    }
  });

  const { data: documents, isLoading: isDocumentsFetching } = useSWR<
    Array<Document>
  >(result?.id ? `/api/document?id=${result.id}` : null, fetcher);

  const previewDocument = documents?.at(-1);

  debug('document', 'Document data fetch state', {
    isDocumentsFetching,
    documentsLength: documents?.length,
    hasPreviewDocument: !!previewDocument,
    previewDocumentId: previewDocument?.id,
    previewDocumentTitle: previewDocument?.title,
    previewDocumentKind: previewDocument?.kind,
    previewDocumentContentLength: previewDocument?.content?.length,
    fetchUrl: result?.id ? `/api/document?id=${result.id}` : null,
    isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
  });

  useEffect(() => {
    const boundingBox = hitboxRef.current?.getBoundingClientRect();

    if (block.documentId && boundingBox) {
      debug('document', 'Updating block bounding box', {
        documentId: block.documentId,
        boundingBox: {
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
        },
        previousBoundingBox: block.boundingBox,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });

      setBlock((block) => ({
        ...block,
        boundingBox: {
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
        },
      }));
    }
  }, [block.documentId, setBlock]);

  if (block.status === 'streaming') {
    debug('document', 'Block is streaming', {
      documentId: block.documentId,
      title: block.title,
      kind: block.kind,
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
        blockId: block.documentId,
        blockStatus: block.status,
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
        blockId: block.documentId,
        blockStatus: block.status,
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
      blockKind: result?.kind ?? args?.kind,
      documentId: result?.id,
      isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
    });
    return <LoadingSkeleton blockKind={result?.kind ?? args?.kind} />;
  }

  const document: Document | null = previewDocument
    ? previewDocument
    : block.status === 'streaming'
      ? {
          title: block.title,
          kind: block.kind,
          content: block.content,
          id: block.documentId,
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
    blockStatus: block.status,
    blockVisibility: block.isVisible,
    isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1,
    resultId: result?.id,
    resultTitle: result?.title
  });

  if (!document) {
    debug('document', 'No document available, showing skeleton', {
      blockKind: block.kind,
      resultId: result?.id,
      argsId: args?.id,
      isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
    });
    return <LoadingSkeleton blockKind={block.kind} />;
  }

  return (
    <div className="relative w-full cursor-pointer">
      <HitboxLayer hitboxRef={hitboxRef} result={result} setBlock={setBlock} />
      <DocumentHeader
        title={document.title}
        kind={document.kind}
        isStreaming={block.status === 'streaming'}
      />
      <DocumentContent document={document} />
    </div>
  );
}

const LoadingSkeleton = ({ blockKind }: { blockKind: BlockKind }) => (
  <div className="w-full">
    <div className="p-4 border rounded-t-2xl flex flex-row gap-2 items-center justify-between dark:bg-muted h-[57px] dark:border-zinc-700 border-b-0">
      <div className="flex flex-row items-center gap-3">
        <div className="text-muted-foreground">
          <div className="animate-pulse rounded-md size-4 bg-muted-foreground/20" />
        </div>
        <div className="animate-pulse rounded-lg h-4 bg-muted-foreground/20 w-24" />
      </div>
      <div>
        <FullscreenIcon />
      </div>
    </div>
    {blockKind === 'image' ? (
      <div className="overflow-y-scroll border rounded-b-2xl bg-muted border-t-0 dark:border-zinc-700">
        <div className="animate-pulse h-[257px] bg-muted-foreground/20 w-full" />
      </div>
    ) : (
      <div className="overflow-y-scroll border rounded-b-2xl p-8 pt-4 bg-muted border-t-0 dark:border-zinc-700">
        <InlineDocumentSkeleton />
      </div>
    )}
  </div>
);

const PureHitboxLayer = ({
  hitboxRef,
  result,
  setBlock,
}: {
  hitboxRef: React.RefObject<HTMLDivElement>;
  result: any;
  setBlock: (updaterFn: UIBlock | ((currentBlock: UIBlock) => UIBlock)) => void;
}) => {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const boundingBox = event.currentTarget.getBoundingClientRect();

      setBlock((block) =>
        block.status === 'streaming'
          ? { ...block, isVisible: true }
          : {
              ...block,
              title: result.title,
              documentId: result.id,
              kind: result.kind,
              isVisible: true,
              boundingBox: {
                left: boundingBox.x,
                top: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
              },
            },
      );
    },
    [setBlock, result],
  );

  return (
    <div
      className="size-full absolute top-0 left-0 rounded-xl z-10"
      ref={hitboxRef}
      onClick={handleClick}
      role="presentation"
      aria-hidden="true"
    >
      <div className="w-full p-4 flex justify-end items-center">
        <div className="absolute right-[9px] top-[13px] p-2 hover:dark:bg-zinc-700 rounded-md hover:bg-zinc-100">
          <FullscreenIcon />
        </div>
      </div>
    </div>
  );
};

const HitboxLayer = memo(PureHitboxLayer, (prevProps, nextProps) => {
  if (!equal(prevProps.result, nextProps.result)) return false;
  return true;
});

const PureDocumentHeader = ({
  title,
  kind,
  isStreaming,
}: {
  title: string;
  kind: BlockKind;
  isStreaming: boolean;
}) => (
  <div className="p-4 border rounded-t-2xl flex flex-row gap-2 items-start sm:items-center justify-between dark:bg-muted border-b-0 dark:border-zinc-700">
    <div className="flex flex-row items-start sm:items-center gap-3">
      <div className="text-muted-foreground">
        {isStreaming ? (
          <div className="animate-spin">
            <LoaderIcon />
          </div>
        ) : kind === 'image' ? (
          <ImageIcon />
        ) : (
          <FileIcon />
        )}
      </div>
      <div className="-translate-y-1 sm:translate-y-0 font-medium">{title}</div>
    </div>
    <div className="w-8" />
  </div>
);

const DocumentHeader = memo(PureDocumentHeader, (prevProps, nextProps) => {
  if (prevProps.title !== nextProps.title) return false;
  if (prevProps.isStreaming !== nextProps.isStreaming) return false;

  return true;
});

const DocumentContent = ({ document }: { document: Document }) => {
  const { block } = useBlock();

  debug('document', 'Document content initialization', {
    documentId: document.id,
    documentKind: document.kind,
    contentLength: document.content?.length,
    blockStatus: block.status,
    hasContent: !!document.content
  });

  const containerClassName = cn(
    'h-[257px] overflow-y-scroll border rounded-b-2xl dark:bg-muted border-t-0 dark:border-zinc-700',
    {
      'p-4 sm:px-14 sm:py-16': document.kind === 'text',
      'p-0': document.kind === 'code',
    },
  );

  const commonProps = {
    content: document.content ?? '',
    isCurrentVersion: true,
    currentVersionIndex: 0,
    status: block.status,
    saveContent: () => {},
    suggestions: [],
  };

  debug('document', 'Editor props prepared', {
    documentId: document.id,
    documentKind: document.kind,
    contentLength: commonProps.content.length,
    isCurrentVersion: commonProps.isCurrentVersion,
    status: commonProps.status
  });

  return (
    <div className={containerClassName}>
      {document.kind === 'text' ? (
        <Editor {...commonProps} onSaveContent={() => {}} />
      ) : document.kind === 'code' ? (
        <div className="flex flex-1 relative w-full">
          <div className="absolute inset-0">
            <CodeEditor {...commonProps} onSaveContent={() => {}} />
          </div>
        </div>
      ) : document.kind === 'sheet' ? (
        <div className="flex flex-1 relative size-full p-4">
          <div className="absolute inset-0">
            <SpreadsheetEditor {...commonProps} />
          </div>
        </div>
      ) : document.kind === 'image' ? (
        <ImageEditor
          title={document.title}
          content={document.content ?? ''}
          isCurrentVersion={true}
          currentVersionIndex={0}
          status={block.status}
          isInline={true}
        />
      ) : null}
    </div>
  );
};
