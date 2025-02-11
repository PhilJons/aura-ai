import type { Message } from 'ai';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { useCopyToClipboard } from 'usehooks-ts';

import type { Vote } from '@/lib/db/schema';

import { CopyIcon, ThumbDownIcon, ThumbUpIcon } from './icons';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { memo } from 'react';
import equal from 'fast-deep-equal';

export function PureMessageActions({
  chatId,
  message,
  vote,
  isLoading,
}: {
  chatId: string;
  message: Message;
  vote: Vote | undefined;
  isLoading: boolean;
}) {
  const { mutate } = useSWRConfig();
  const [_, copyToClipboard] = useCopyToClipboard();

  if (isLoading) return null;
  if (message.role === 'user') return null;
  if (message.toolInvocations && message.toolInvocations.length > 0)
    return null;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-row gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground"
              variant="outline"
              onClick={async () => {
                await copyToClipboard(message.content as string);
                toast.success('Copied to clipboard!');
              }}
            >
              <CopyIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              disabled={vote?.isUpvoted}
              variant="outline"
              onClick={async () => {
                const upvote = fetch('/api/vote', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    chatId,
                    messageId: message.id,
                    type: 'up',
                  }),
                });

                toast.promise(upvote, {
                  loading: 'Upvoting Response...',
                  success: () => {
                    mutate(
                      `/api/vote?chatId=${chatId}`,
                      (currentVotes: Vote[] | undefined) => {
                        if (!currentVotes) return [];

                        const existingVote = currentVotes.find(
                          (vote) => vote.messageId === message.id,
                        );

                        if (existingVote) {
                          return currentVotes.map((vote) =>
                            vote.messageId === message.id
                              ? { ...vote, isUpvoted: true }
                              : vote,
                          );
                        }

                        const newVote: Vote = {
                          chatId,
                          messageId: message.id,
                          isUpvoted: true,
                          type: 'vote' as const
                        };

                        return [...currentVotes, newVote];
                      },
                      { revalidate: false },
                    );

                    return 'Upvoted Response!';
                  },
                  error: 'Failed to upvote response.',
                });
              }}
            >
              <ThumbUpIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Upvote Response</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="py-1 px-2 h-fit text-muted-foreground !pointer-events-auto"
              variant="outline"
              disabled={vote && !vote.isUpvoted}
              onClick={async () => {
                const downvote = fetch('/api/vote', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    chatId,
                    messageId: message.id,
                    type: 'down',
                  }),
                });

                toast.promise(downvote, {
                  loading: 'Downvoting Response...',
                  success: () => {
                    mutate(
                      `/api/vote?chatId=${chatId}`,
                      (currentVotes: Vote[] | undefined) => {
                        if (!currentVotes) return [];

                        const existingVote = currentVotes.find(
                          (vote) => vote.messageId === message.id,
                        );

                        if (existingVote) {
                          return currentVotes.map((vote) =>
                            vote.messageId === message.id
                              ? { ...vote, isUpvoted: false }
                              : vote,
                          );
                        }

                        const newVote: Vote = {
                          chatId,
                          messageId: message.id,
                          isUpvoted: false,
                          type: 'vote' as const
                        };

                        return [...currentVotes, newVote];
                      },
                      { revalidate: false },
                    );

                    return 'Downvoted Response!';
                  },
                  error: 'Failed to downvote response.',
                });
              }}
            >
              <ThumbDownIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Downvote Response</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export const MessageActions = memo(
  PureMessageActions,
  (prevProps, nextProps) => {
    if (!equal(prevProps.vote, nextProps.vote)) return false;
    if (prevProps.isLoading !== nextProps.isLoading) return false;

    return true;
  },
);
