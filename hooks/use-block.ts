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
  return useMemo(
    () => ({
      block: { ...initialBlockData, isVisible: false },
      setBlock: () => {},
      metadata: null,
      setMetadata: () => {},
    }),
    []
  );
}
