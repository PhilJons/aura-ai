
import {
  memo,
} from 'react';
§ import { codeBlock } from '@/blocks/code/client';
import { sheetBlock } from '@/blocks/sheet/client';
import { textBlock } from '@/blocks/text/client';

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

PureBlock.displayName = 'PureBlock';

export const Block = memo(() => null, () => true);
Block.displayName = 'Block';
