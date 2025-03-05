'use client';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import { useEffect, } from 'react';

import { ModelSelector } from '@/components/model-selector';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { type VisibilityType, VisibilitySelector } from './visibility-selector';
import { SystemPromptDialog } from '@/components/system-prompt-dialog';

function DocumentContextSSE({ chatId, isProcessingFile }: { 
  chatId: string;
  isProcessingFile: boolean;
}) {
  useEffect(() => {
    if (!chatId) return;

    console.log('[DocumentContextSSE] Initializing with:', { 
      chatId, 
      isProcessingFile,
      timestamp: new Date().toISOString()
    });

    let eventSource: EventSource | null = null;

    function setupEventSource() {
      if (eventSource) {
        console.log('[DocumentContextSSE] Closing existing connection');
        eventSource.close();
      }

      console.log('[DocumentContextSSE] Setting up new SSE connection');
      eventSource = new EventSource(`/api/chat/stream?chatId=${chatId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[DocumentContextSSE] Received message:', {
            type: data.type,
            hasImages: data.hasImages,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error('[DocumentContextSSE] Error parsing message:', error);
        }
      };

      eventSource.onopen = () => {
        console.log('[DocumentContextSSE] Connection opened');
      };

      eventSource.onerror = (error) => {
        console.error('[DocumentContextSSE] Connection error:', error);
        // Log connection state
        console.log('[DocumentContextSSE] Connection state:', {
          readyState: eventSource?.readyState,
          // 0 = connecting, 1 = open, 2 = closed
          state: ['connecting', 'open', 'closed'][eventSource?.readyState || 0]
        });
        
        // Attempt to reconnect on error after a delay
        setTimeout(() => {
          console.log('[DocumentContextSSE] Attempting to reconnect...');
          setupEventSource();
        }, 1000);
      };
    }

    setupEventSource();

    return () => {
      if (eventSource) {
        console.log('[DocumentContextSSE] Cleaning up connection');
        eventSource.close();
      }
    };
  }, [chatId]);

  return null;
}

interface ChatHeaderProps {
  chatId: string;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  isLoading: boolean;
  isProcessingFile: boolean;
  hasMessages: boolean;
}

function PureChatHeader({
  chatId,
  selectedModelId,
  selectedVisibilityType,
  isReadonly,
  isLoading,
  isProcessingFile,
  hasMessages,
}: ChatHeaderProps) {
  const router = useRouter();
  const { open } = useSidebar();
  const { width: windowWidth } = useWindowSize();

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
      <DocumentContextSSE chatId={chatId} isProcessingFile={isProcessingFile} />
      
      <SidebarToggle />

      {(!open || windowWidth < 768) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="order-2 md:order-1 md:px-2 px-2 md:h-fit ml-auto md:ml-0"
              onClick={() => {
                router.push('/');
                router.refresh();
              }}
            >
              <PlusIcon />
              <span className="md:sr-only">New Chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
      )}

      <div className="flex items-center gap-2">
        <ModelSelector 
          selectedModelId={selectedModelId} 
          className="order-1 md:order-2"
          isDisabled={hasMessages}
        />
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
          className="order-1 md:order-3"
        />
      </div>

      <div className="flex items-center">
        <SystemPromptDialog chatId={chatId} isProcessingFile={isProcessingFile} />
      </div>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  // Only re-render when these specific props change
  return prevProps.selectedModelId === nextProps.selectedModelId &&
         prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
         prevProps.isLoading === nextProps.isLoading &&
         prevProps.isProcessingFile === nextProps.isProcessingFile &&
         prevProps.isReadonly === nextProps.isReadonly &&
         prevProps.hasMessages === nextProps.hasMessages;
});
