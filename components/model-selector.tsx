'use client';

import { startTransition, useMemo, useOptimistic, useState } from 'react';
import { useSession } from 'next-auth/react';

import { saveChatModelAsCookie } from '@/app/(chat)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { chatModels } from '@/lib/ai/models';
import { cn } from '@/lib/utils';
import { trackModelSelection } from '@/lib/client-analytics';

import { CheckCircleFillIcon, ChevronDownIcon } from './icons';

export function ModelSelector({
  selectedModelId,
  className,
  onModelChange,
  chatId,
  isLoaded = true,
}: {
  selectedModelId: string;
  onModelChange?: (modelId: string) => void;
  chatId?: string;
  isLoaded?: boolean;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);
  const [optimisticModelId, setOptimisticModelId] =
    useOptimistic(selectedModelId);
  const { data: session } = useSession();
  const userEmail = session?.user?.email;

  const selectedChatModel = useMemo(
    () => chatModels.find((chatModel) => chatModel.id === optimisticModelId),
    [optimisticModelId],
  );

  // Show a skeleton loader while model is loading
  if (!isLoaded) {
    return (
      <Button variant="outline" className={cn("md:px-2 md:h-[34px] min-w-[110px]", className)} disabled>
        <div className="w-full h-4 bg-muted animate-pulse rounded" />
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button variant="outline" className="md:px-2 md:h-[34px]">
          {selectedChatModel?.name}
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        {chatModels.filter(model => model.enabled).map((chatModel) => {
          const { id } = chatModel;

          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => {
                setOpen(false);

                startTransition(() => {
                  setOptimisticModelId(id);
                  if (onModelChange) {
                    onModelChange(id);
                  }
                  saveChatModelAsCookie(id, chatId).then(() => {
                    // Dispatch a custom event to notify that cookies have changed
                    window.dispatchEvent(new Event('cookie-change'));
                  });
                  trackModelSelection(id, userEmail || undefined);
                });
              }}
              className="gap-4 group/item flex flex-row justify-between items-center"
              data-active={id === optimisticModelId}
            >
              <div className="flex flex-col gap-1 items-start">
                <div>{chatModel.name}</div>
                <div className="text-xs text-muted-foreground">
                  {chatModel.description}
                </div>
              </div>

              <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                <CheckCircleFillIcon />
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
