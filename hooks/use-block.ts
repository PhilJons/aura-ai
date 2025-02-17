'use client';

import useSWR from 'swr';
import type { UIBlock } from '@/components/block';
import { useCallback, useMemo, useRef } from 'react';
import { debug } from '@/lib/utils/debug';

export const initialBlockData: UIBlock = {
  documentId: 'init',
  content: '',
  kind: 'text',
  title: '',
  status: 'idle',
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
};

type Selector<T> = (state: UIBlock) => T;

export function useBlockSelector<Selected>(selector: Selector<Selected>) {
  const { data: localBlock } = useSWR<UIBlock>('block', null, {
    fallbackData: initialBlockData,
    revalidateOnFocus: false,
    revalidateIfStale: false
  });

  const selectedValue = useMemo(() => {
    if (!localBlock) return selector(initialBlockData);
    return selector(localBlock);
  }, [localBlock, selector]);

  return selectedValue;
}

export function useBlock() {
  const { data: localBlock, mutate: setLocalBlock } = useSWR<UIBlock>(
    'block',
    null,
    {
      fallbackData: initialBlockData,
      revalidateOnFocus: false,
      revalidateIfStale: false
    }
  );

  const block = useMemo(() => {
    if (!localBlock) return initialBlockData;
    return localBlock;
  }, [localBlock]);

  const previousBlock = useRef(block);

  const setBlock = useCallback(
    (updaterFn: UIBlock | ((currentBlock: UIBlock) => UIBlock)) => {
      setLocalBlock((currentBlock) => {
        const blockToUpdate = currentBlock || initialBlockData;
        const newBlock = typeof updaterFn === 'function' ? updaterFn(blockToUpdate) : updaterFn;

        // Only update if there are actual changes
        if (JSON.stringify(newBlock) === JSON.stringify(previousBlock.current)) {
          debug('block', 'Skipping block update - no changes', {
            documentId: newBlock.documentId,
            status: newBlock.status
          });
          return blockToUpdate;
        }

        debug('block', 'Updating block state', {
          fromDocumentId: previousBlock.current.documentId,
          toDocumentId: newBlock.documentId,
          fromStatus: previousBlock.current.status,
          toStatus: newBlock.status,
          hasContentChange: previousBlock.current.content !== newBlock.content
        });

        previousBlock.current = newBlock;
        return newBlock;
      }, false); // Set revalidate to false to prevent unnecessary revalidation
    },
    [setLocalBlock]
  );

  const { data: localBlockMetadata, mutate: setLocalBlockMetadata } = useSWR<any>(
    () => (block.documentId ? `block-metadata-${block.documentId}` : null),
    null,
    {
      fallbackData: null,
      revalidateOnFocus: false,
      revalidateIfStale: false
    }
  );

  const previousMetadata = useRef(localBlockMetadata);

  const setMetadata = useCallback(
    (updaterFn: any) => {
      setLocalBlockMetadata((currentMetadata: any) => {
        const newMetadata = typeof updaterFn === 'function' ? updaterFn(currentMetadata) : updaterFn;

        // Only update if there are actual changes
        if (JSON.stringify(newMetadata) === JSON.stringify(previousMetadata.current)) {
          debug('block', 'Skipping metadata update - no changes', {
            documentId: block.documentId
          });
          return currentMetadata;
        }

        debug('block', 'Updating block metadata', {
          documentId: block.documentId,
          hasMetadataChange: true
        });

        previousMetadata.current = newMetadata;
        return newMetadata;
      }, false); // Set revalidate to false to prevent unnecessary revalidation
    },
    [block.documentId, setLocalBlockMetadata]
  );

  return useMemo(
    () => ({
      block,
      setBlock,
      metadata: localBlockMetadata,
      setMetadata,
    }),
    [block, setBlock, localBlockMetadata, setMetadata]
  );
}
