import { memo } from 'react';
import { CrossIcon } from './icons';
import { Button } from './ui/button';
import { useBlock } from '@/hooks/use-block';

function PureBlockCloseButton() {
  const { setBlock } = useBlock();

  // Feature temporarily disabled
  return null;
}

PureBlockCloseButton.displayName = 'PureBlockCloseButton';

export const BlockCloseButton = memo(PureBlockCloseButton, () => true);
BlockCloseButton.displayName = 'BlockCloseButton';
