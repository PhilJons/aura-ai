'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';
import { blockDefinitions, type BlockKind } from './block';
import type { Suggestion } from '@/lib/db/schema';
import { initialBlockData, useBlock } from '@/hooks/use-block';
import { debug } from '@/lib/utils/debug';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind';
  content: string | Suggestion;
};

export function DataStreamHandler({ id }: { id: string }) {
  const { data: dataStream } = useChat({ id });
  const { block, setBlock, setMetadata } = useBlock();
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    debug('block', 'Data stream update received', {
      streamLength: dataStream.length,
      lastProcessedIndex: lastProcessedIndex.current,
      blockId: block.documentId,
      blockStatus: block.status,
      newDeltasCount: dataStream.length - (lastProcessedIndex.current + 1)
    });

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      debug('block', 'Processing stream delta', {
        deltaType: delta.type,
        contentPreview: typeof delta.content === 'string' 
          ? `${delta.content.substring(0, 100)}...`
          : 'suggestion object',
        blockId: block.documentId,
        blockStatus: block.status
      });

      const blockDefinition = blockDefinitions.find(
        (blockDefinition) => blockDefinition.kind === block.kind,
      );

      if (blockDefinition?.onStreamPart) {
        debug('block', 'Calling block definition onStreamPart', {
          blockKind: block.kind,
          deltaType: delta.type,
          hasStreamHandler: !!blockDefinition.onStreamPart
        });

        blockDefinition.onStreamPart({
          streamPart: delta,
          setBlock,
          setMetadata,
        });
      }

      setBlock((draftBlock) => {
        if (!draftBlock) {
          debug('block', 'Initializing new block', { 
            status: 'streaming',
            deltaType: delta.type
          });
          return { ...initialBlockData, status: 'streaming' };
        }

        debug('block', 'Updating block state from stream', {
          currentStatus: draftBlock.status,
          deltaType: delta.type,
          documentId: draftBlock.documentId,
          currentContent: `${draftBlock.content?.substring(0, 100)}...`
        });

        switch (delta.type) {
          case 'id':
            debug('block', 'Setting document ID', {
              newId: delta.content,
              oldId: draftBlock.documentId
            });
            return {
              ...draftBlock,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            debug('block', 'Setting document title', {
              newTitle: delta.content,
              oldTitle: draftBlock.title
            });
            return {
              ...draftBlock,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            debug('block', 'Setting document kind', {
              newKind: delta.content,
              oldKind: draftBlock.kind
            });
            return {
              ...draftBlock,
              kind: delta.content as BlockKind,
              status: 'streaming',
            };

          case 'clear':
            debug('block', 'Clearing document content', {
              documentId: draftBlock.documentId,
              oldContentLength: draftBlock.content?.length
            });
            return {
              ...draftBlock,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            debug('block', 'Finishing document stream', {
              documentId: draftBlock.documentId,
              title: draftBlock.title,
              kind: draftBlock.kind,
              contentLength: draftBlock.content?.length
            });
            return {
              ...draftBlock,
              status: 'idle',
            };

          default:
            return draftBlock;
        }
      });
    });
  }, [dataStream, setBlock, setMetadata, block]);

  return null;
}
