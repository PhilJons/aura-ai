'use client';

import { startTransition, useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

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

import { CheckCircleFillIcon, ChevronDownIcon } from './icons';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Map URL parameter values to internal model IDs
const URL_MODEL_MAP: Record<string, string> = {
  'gpt-4o': 'chat-model-large',
  'gpt-4o-mini': 'chat-model-small'
};

// Reverse mapping for internal model IDs to URL parameter values
const INTERNAL_MODEL_MAP: Record<string, string> = {
  'chat-model-large': 'gpt-4o',
  'chat-model-small': 'gpt-4o-mini'
};

export function ModelSelector({
  selectedModelId,
  className,
  isDisabled = false,
}: {
  selectedModelId: string;
  isDisabled?: boolean;
} & React.ComponentProps<typeof Button>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Ensure URL parameter is set on initial render
  useEffect(() => {
    if (isDisabled) return;
    
    const currentUrlModel = searchParams.get('model');
    const expectedUrlModel = INTERNAL_MODEL_MAP[selectedModelId];
    
    // If URL doesn't have the model parameter or it doesn't match the selected model
    if (!currentUrlModel || currentUrlModel !== expectedUrlModel) {
      console.log("ModelSelector - Updating URL to match selected model:", {
        from: currentUrlModel,
        to: expectedUrlModel,
        selectedModelId
      });
      
      // Update URL without causing a page reload
      const params = new URLSearchParams(searchParams.toString());
      params.set('model', expectedUrlModel);
      
      // Use window.history to update the URL without causing a full page reload
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('model', expectedUrlModel);
        window.history.replaceState({}, '', currentUrl.toString());
        
        // Also use router.replace for Next.js internal state
        router.replace(`${pathname}?${params.toString()}`, { 
          scroll: false,
        });
      }
    }
  }, [selectedModelId, searchParams, isDisabled, pathname, router]);

  const selectedChatModel = useMemo(
    () => chatModels.find((chatModel) => chatModel.id === selectedModelId),
    [selectedModelId],
  );

  // Function to update URL without causing a page reload
  const updateModelInUrl = (modelId: string) => {
    if (isDisabled) return;
    
    const urlValue = INTERNAL_MODEL_MAP[modelId] || 'gpt-4o-mini';
    console.log("ModelSelector - Updating model in URL:", {
      modelId,
      urlValue,
      currentPath: pathname
    });
    
    const params = new URLSearchParams(searchParams.toString());
    params.set('model', urlValue);
    
    // Get the current path with any existing chat ID
    const currentPath = pathname;
    
    // Update URL without full page reload
    router.replace(`${currentPath}?${params.toString()}`, { 
      scroll: false,
    });
    
    // Also update the URL directly to ensure it takes effect immediately
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        {}, 
        '', 
        `${currentPath}?${params.toString()}`
      );
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={isDisabled ? () => {} : setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            asChild
            className={cn(
              'w-fit',
              isDisabled 
                ? 'opacity-60 cursor-not-allowed' 
                : 'data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
              className,
            )}
            disabled={isDisabled}
          >
            <Button 
              variant="outline" 
              className={cn("md:px-2 md:h-[34px]", isDisabled ? "opacity-60" : "")}
              disabled={isDisabled}
            >
              {selectedChatModel?.name}
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {isDisabled && (
          <TooltipContent side="bottom">
            Model cannot be changed once a chat has started
          </TooltipContent>
        )}
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[300px]">
        {chatModels.filter(model => model.enabled).map((chatModel) => {
          const { id } = chatModel;

          return (
            <DropdownMenuItem
              key={id}
              onSelect={() => {
                // Only proceed if this is a different model
                if (id !== selectedModelId && !isDisabled) {
                  setOpen(false);
                  
                  // Update URL without causing a page reload
                  updateModelInUrl(id);
                  
                  // Use startTransition to avoid blocking the UI
                  startTransition(() => {
                    saveChatModelAsCookie(id);
                  });
                }
              }}
              className="gap-4 group/item flex flex-row justify-between items-center"
              data-active={id === selectedModelId}
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
