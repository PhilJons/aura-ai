import { useEffect, useRef, type RefObject, useState } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
  RefObject<T>,
  RefObject<T>,
] {
  const containerRef = useRef<T>(null);
  const endRef = useRef<T>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [userHasScrolled, setUserHasScrolled] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      // Check if we're near the bottom
      const checkIfNearBottom = () => {
        if (!container) return;
        const threshold = 100; // pixels from bottom
        const position = container.scrollHeight - container.scrollTop - container.clientHeight;
        setIsNearBottom(position < threshold);
      };

      // Track user scrolling
      const handleScroll = () => {
        if (!userHasScrolled) {
          setUserHasScrolled(true);
        }
        checkIfNearBottom();
      };

      // Add scroll listener to track position
      container.addEventListener('scroll', handleScroll);
      
      // Only scroll on content changes if we're near the bottom and user hasn't scrolled up
      const observer = new MutationObserver((mutations) => {
        // Check if any mutations added new nodes
        const hasNewMessages = mutations.some(mutation => 
          mutation.type === 'childList' && mutation.addedNodes.length > 0
        );

        // Only auto-scroll if:
        // 1. There are new messages
        // 2. We're near the bottom
        // 3. User hasn't manually scrolled up OR we're in a new message sequence
        if (hasNewMessages && isNearBottom && (!userHasScrolled || mutations.some(m => 
          m.target.textContent?.includes('Thinking...')
        ))) {
          end.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
      });

      // Reset user scroll state when reaching bottom
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
        setUserHasScrolled(false);
      }

      return () => {
        observer.disconnect();
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, [isNearBottom, userHasScrolled]);

  return [containerRef, endRef];
}
