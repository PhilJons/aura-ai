'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchResultItem } from '@/lib/ai/tools/search';
import { SearchIcon, AlertCircleIcon, Loader2 } from 'lucide-react';

interface SearchResultsProps {
  results: SearchResultItem[];
  query?: string;
  isLoading?: boolean;
}

export function SearchResults({ results, query = '', isLoading = false }: SearchResultsProps) {
  const [showAllResults, setShowAllResults] = useState(false);

  // Even if there are no results, we should show a message
  const hasResults = results && results.length > 0;

  const handleViewMore = () => {
    setShowAllResults(true);
  };

  const displayedResults = hasResults ? (showAllResults ? results : results.slice(0, 3)) : [];
  const additionalResultsCount = hasResults && results.length > 3 ? results.length - 3 : 0;

  const displayUrlName = (url: string) => {
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split('.');
      return parts.length > 2 ? parts.slice(1, -1).join('.') : parts[0];
    } catch (e) {
      return url;
    }
  };

  // Show loading state if isLoading is true
  if (isLoading) {
    return (
      <div className="my-4 space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <SearchIcon size={14} />
          <span className="font-medium">Searching for: "{query}"</span>
        </div>
        <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 mb-4 animate-spin" />
          <p className="text-sm">Searching the web for relevant information...</p>
        </div>
      </div>
    );
  }

  if (!hasResults) {
    return (
      <div className="my-4 space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <SearchIcon size={14} />
          <span className="font-medium">No web search results found for: "{query}"</span>
        </div>
        <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
          <AlertCircleIcon className="h-5 w-5 mb-2" />
          <p className="text-sm mb-1">No relevant information found online.</p>
          <p className="text-xs">The AI will still use its built-in knowledge to help answer your question.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
      <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
        <SearchIcon size={14} />
        <span className="font-medium">Web search results for: "{query}"</span>
      </div>
      
      <div className="flex flex-wrap -m-1">
        {displayedResults.map((result, index) => (
          <div className="w-1/2 md:w-1/4 p-1" key={index}>
            <Link href={result.url} passHref target="_blank" rel="noopener noreferrer">
              <Card className="flex-1 h-full hover:bg-muted/50 transition-colors">
                <CardContent className="p-2 flex flex-col justify-between h-full">
                  <p className="text-xs line-clamp-2 min-h-[2rem] font-medium text-blue-600 dark:text-blue-400">
                    {result.title || result.content}
                  </p>
                  <div className="mt-2 flex items-center space-x-1">
                    <Avatar className="h-4 w-4">
                      <AvatarImage
                        src={`https://www.google.com/s2/favicons?domain=${new URL(result.url).hostname}`}
                        alt={new URL(result.url).hostname}
                      />
                      <AvatarFallback className="text-[8px]">
                        {new URL(result.url).hostname[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-xs opacity-60 truncate">
                      {`${displayUrlName(result.url)} - ${index + 1}`}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        ))}
        
        {!showAllResults && additionalResultsCount > 0 && (
          <div className="w-1/2 md:w-1/4 p-1">
            <Card className="flex-1 flex h-full items-center justify-center">
              <CardContent className="p-2">
                <Button
                  variant="link"
                  className="text-muted-foreground"
                  onClick={handleViewMore}
                >
                  View {additionalResultsCount} more
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
} 