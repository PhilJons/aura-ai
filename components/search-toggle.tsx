'use client';

import { Globe } from 'lucide-react';
import { useEffect, useState, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';
import { Toggle } from './ui/toggle';

type SearchToggleContextType = {
  isSearchEnabled: boolean;
  setIsSearchEnabled: (enabled: boolean) => void;
};

const SearchToggleContext = createContext<SearchToggleContextType | null>(null);

export function useSearchToggle() {
  const context = useContext(SearchToggleContext);
  if (!context) {
    throw new Error('useSearchToggle must be used within a SearchToggleProvider');
  }
  return context;
}

export function SearchToggleProvider({ children }: { children: React.ReactNode }) {
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('tavily-search-enabled');
    if (savedState !== null) {
      setIsSearchEnabled(JSON.parse(savedState));
    }
  }, []);

  // Save state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('tavily-search-enabled', JSON.stringify(isSearchEnabled));
  }, [isSearchEnabled]);

  return (
    <SearchToggleContext.Provider value={{ isSearchEnabled, setIsSearchEnabled }}>
      {children}
    </SearchToggleContext.Provider>
  );
}

export function SearchToggle() {
  const { isSearchEnabled, setIsSearchEnabled } = useSearchToggle();

  return (
    <Toggle
      aria-label="Toggle search mode"
      pressed={isSearchEnabled}
      onPressedChange={setIsSearchEnabled}
      variant="outline"
      style={{
        '--accent-blue': '210 100% 50%',
        '--accent-blue-foreground': '0 0% 100%',
        '--accent-blue-border': '210 100% 60%',
      } as React.CSSProperties}
      className={cn(
        'gap-1 px-3 border border-input text-muted-foreground bg-background ml-2',
        'data-[state=on]:bg-accent-blue',
        'data-[state=on]:text-accent-blue-foreground',
        'data-[state=on]:border-accent-blue-border',
        'hover:bg-accent hover:text-accent-foreground rounded-full'
      )}
    >
      <Globe className="size-4" />
      <span className="text-xs">Search</span>
    </Toggle>
  );
} 