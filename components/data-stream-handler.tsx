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
  return null;
}
