import type {
  Attachment,
  ChatRequestOptions,
  CreateMessage,
  Message,
} from 'ai';
import { formatDistance } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useDebounceCallback, useWindowSize } from 'usehooks-ts';
import type { Document, Vote } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { MultimodalInput } from './multimodal-input';
import { Toolbar } from './toolbar';
import { VersionFooter } from './version-footer';
import { BlockActions } from './block-actions';
import { BlockCloseButton } from './block-close-button';
import { BlockMessages } from './block-messages';
import { useSidebar } from './ui/sidebar';
import { useBlock } from '@/hooks/use-block';
import { imageBlock } from '@/blocks/image/client';
import { codeBlock } from '@/blocks/code/client';
import { sheetBlock } from '@/blocks/sheet/client';
import { textBlock } from '@/blocks/text/client';
import equal from 'fast-deep-equal';
import { debug, debugError } from '@/lib/utils/debug';

export const blockDefinitions = [textBlock, codeBlock, imageBlock, sheetBlock];
export type BlockKind = (typeof blockDefinitions)[number]['kind'];

export interface UIBlock {
  title: string;
  documentId: string;
  kind: BlockKind;
  content: string;
  isVisible: boolean;
  status: 'streaming' | 'idle';
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}

function PureBlock() {
  // Feature temporarily disabled
  return null;
}

export const Block = memo(() => null, () => true);
