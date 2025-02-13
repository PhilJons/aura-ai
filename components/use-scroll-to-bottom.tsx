import { useEffect, useRef, useState } from 'react';

export function useScrollToBottom<T extends HTMLElement>(): [
  React.RefObject<T>,
  React.RefObject<HTMLDivElement>,
] {
  const containerRef = useRef<T>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - (scrollTop + clientHeight) < 100;
      
      // Only set userHasScrolled if we're not near the bottom
      if (!isNearBottom) {
        setUserHasScrolled(true);
      } else {
        setUserHasScrolled(false);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const end = messagesEndRef.current;
    if (!container || !end) return;

    const observer = new MutationObserver((mutations) => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - (scrollTop + clientHeight) < 100;
      
      // Auto-scroll if:
      // 1. User hasn't scrolled up OR
      // 2. User is already near bottom OR
      // 3. New message is a "Thinking..." message
      if (!userHasScrolled || isNearBottom || mutations.some(m => 
        m.target.textContent?.includes('Thinking...')
      )) {
        end.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [userHasScrolled]);

  return [containerRef, messagesEndRef];
} 