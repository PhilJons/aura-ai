'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchIcon, AlertCircleIcon, Loader2 } from 'lucide-react';
import { debug } from '@/lib/utils/debug';
import { cn } from '@/lib/utils';

// Extend the imported SearchResultItem to add our new property
import type { SearchResultItem as BaseSearchResultItem } from '@/lib/ai/tools/search';
interface SearchResultItem extends BaseSearchResultItem {
  searchQuery?: string; // Add optional property for the source query
}

interface SearchResultsProps {
  results: SearchResultItem[];
  query?: string;
  isLoading?: boolean;
  isConsolidated?: boolean; // Add flag for consolidated view
}

export function SearchResults({ results, query = '', isLoading = false, isConsolidated = false }: SearchResultsProps) {
  // Validate URLs in results to prevent Invalid URL errors
  const validatedResults = useMemo(() => {
    if (!results || results.length === 0) return [];
    
    return results.map(result => {
      // Check if URL is valid and fix it if not
      if (!result.url || typeof result.url !== 'string') {
        return {
          ...result,
          url: 'about:blank' // Use a valid URL that won't cause errors
        };
      }
      
      // Try to validate the URL
      try {
        // If URL doesn't start with http:// or https://, add https://
        let urlToTest = result.url;
        if (urlToTest === '#') {
          return {
            ...result,
            url: 'about:blank' // Use a valid URL that won't cause errors
          };
        }
        
        if (!/^https?:\/\//i.test(urlToTest)) {
          urlToTest = 'https://' + urlToTest;
        }
        
        // Test if it's valid by creating a URL object
        new URL(urlToTest);
        
        // If valid but needed prefix, update it
        if (urlToTest !== result.url) {
          return {
            ...result,
            url: urlToTest
          };
        }
        
        // Original URL was valid
        return result;
      } catch (e) {
        // URL is invalid but don't log errors during render
        return {
          ...result,
          url: 'about:blank' // Safe fallback
        };
      }
    });
  }, [results]);

  // Memoize result key for stable identity
  const resultsKey = useMemo(() => {
    try {
      const resultsIds = validatedResults.map(r => r.url).join('|').substring(0, 100);
      return `results-${validatedResults.length}-${resultsIds}`;
    } catch (e) {
      return `results-${validatedResults.length}`;
    }
  }, [validatedResults]);

  // Keep the showAllResults state during re-renders with a key based on query
  const [showAllResults, setShowAllResults] = useState(() => {
    // If we have 3 or fewer results, we show all by default
    return validatedResults && validatedResults.length <= 3 ? true : false;
  });

  // Even if there are no results, we should show a message
  const hasResults = results && results.length > 0;
  
  // Log information about the search results when they change
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      debug('message', 'SearchResults component rendered', {
        resultsKey,
        resultCount: results.length,
        isLoading,
        query,
        isConsolidated
      });
    }
    
    // Force re-render when results change during streaming
    if (isLoading && results.length > 0) {
      const timer = setTimeout(() => {
        // This empty state update forces a re-render
        if (isMounted.current) {
          setShowAllResults(prev => prev);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [resultsKey, results.length, isLoading, query, isConsolidated]);

  // Log info in development mode - move to useEffect to prevent render phase logging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[SearchResults] Rendering with:', { 
        hasResults, 
        resultCount: results.length, 
        validatedResultsCount: validatedResults.length,
        isLoading,
        isConsolidated
      });
    }
  }, [hasResults, results.length, validatedResults.length, isLoading, isConsolidated]);

  // Reference to track if component was mounted (to prevent state updates after unmount)
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleViewMore = useCallback(() => {
    if (isMounted.current) {
      setShowAllResults(true);
    }
  }, []);

  const displayedResults = useMemo(() => 
    hasResults ? (showAllResults ? validatedResults : validatedResults.slice(0, 3)) : [],
    [hasResults, showAllResults, validatedResults]
  );
  
  const additionalResultsCount = useMemo(() => 
    hasResults && validatedResults.length > 3 ? validatedResults.length - 3 : 0,
    [hasResults, validatedResults.length]
  );

  // Group results by source/query for consolidated view
  const resultsBySource = useMemo(() => {
    if (!isConsolidated || !hasResults) return null;
    
    const sourceMap = new Map<string, SearchResultItem[]>();
    
    validatedResults.forEach(result => {
      const source = result.searchQuery || 'Unknown';
      if (!sourceMap.has(source)) {
        sourceMap.set(source, []);
      }
      sourceMap.get(source)!.push(result);
    });
    
    return sourceMap;
  }, [isConsolidated, hasResults, validatedResults]);

  // Safe function to get hostname from URL - no console.error calls during render
  const getHostname = (url: string) => {
    if (!url || url === '#' || url === 'about:blank') return '';
    
    try {
      // If URL doesn't start with http:// or https://, add https://
      let urlToProcess = url;
      if (!/^https?:\/\//i.test(urlToProcess)) {
        urlToProcess = 'https://' + urlToProcess;
      }
      
      return new URL(urlToProcess).hostname;
    } catch (e) {
      // Don't log errors during render
      return '';
    }
  };

  // Display URL name function - no console.error calls during render
  const displayUrlName = (url: string) => {
    if (!url || url === '#' || url === 'about:blank') return 'No source';
    
    try {
      // If URL doesn't start with http:// or https://, add https://
      let urlToProcess = url;
      if (!/^https?:\/\//i.test(urlToProcess)) {
        urlToProcess = 'https://' + urlToProcess;
      }
      
      const hostname = new URL(urlToProcess).hostname;
      const parts = hostname.split('.');
      return parts.length > 2 ? parts.slice(1, -1).join('.') : parts[0];
    } catch (e) {
      // Don't log errors during render
      return 'Unknown source';
    }
  };

  // Show loading state if isLoading is true
  if (isLoading) {
    return (
      <div className="my-4 space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <SearchIcon size={14} />
          <span className="font-medium">Searching for: &quot;{query}&quot;</span>
        </div>
        <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
          <Loader2 className="size-8 mb-4 animate-spin" />
          <p className="text-sm">Searching the web for relevant information...</p>
        </div>
      </div>
    );
  }

  // Always render results even if loading is true but we have results
  // This helps during streaming when results are being updated
  if (!hasResults && !isLoading) {
    return (
      <div className="my-4 space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
          <SearchIcon size={14} />
          <span className="font-medium">No web search results found for: &quot;{query}&quot;</span>
        </div>
        <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
          <AlertCircleIcon className="size-5 mb-2" />
          <p className="text-sm mb-1">No relevant information found online.</p>
          <p className="text-xs">The AI will still use its built-in knowledge to help answer your question.</p>
        </div>
      </div>
    );
  }

  // For consolidated view with sources
  if (isConsolidated && resultsBySource) {
    return (
      <div className="my-4 space-y-4">
        {/* Render results grouped by source */}
        {Array.from(resultsBySource.entries()).map(([source, sourceResults]) => (
          <div key={source} className="space-y-2">
            {/* Source label */}
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted">
                {source}
              </span>
              <span className="text-xs text-muted-foreground">
                ({sourceResults.length} {sourceResults.length === 1 ? 'result' : 'results'})
              </span>
            </div>
            
            {/* Results for this source in a grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {sourceResults.map((result, index) => (
                <Link 
                  href={result.url} 
                  passHref 
                  target="_blank" 
                  rel="noopener noreferrer"
                  key={index}
                  className="block h-full"
                >
                  <div className="border rounded-md p-2 h-full hover:bg-muted/50 transition-colors flex flex-col">
                    <p className="text-xs line-clamp-2 font-medium text-blue-600 dark:text-blue-400 mb-auto">
                      {result.title || result.content.substring(0, 100)}
                    </p>
                    <div className="mt-2 flex items-center space-x-1">
                      <Avatar className="size-4 shrink-0">
                        <AvatarImage
                          src={`https://www.google.com/s2/favicons?domain=${getHostname(result.url)}`}
                          alt={getHostname(result.url)}
                        />
                        <AvatarFallback className="text-[8px]">
                          {getHostname(result.url)[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-xs text-muted-foreground truncate">
                        {displayUrlName(result.url)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Standard non-consolidated view
  return (
    <div className="my-4 space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
      <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
        <SearchIcon size={14} />
        <span className="font-medium">Web search results for: &quot;{query}&quot;</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {displayedResults.map((result, index) => (
          <Link 
            href={result.url} 
            passHref 
            target="_blank" 
            rel="noopener noreferrer"
            key={index}
            className="block h-full"
          >
            <div className="border rounded-md p-2 size-full hover:bg-muted/50 transition-colors flex flex-col">
              <p className="text-xs line-clamp-2 min-h-8 font-medium text-blue-600 dark:text-blue-400 mb-auto">
                {result.title || result.content}
              </p>
              <div className="mt-2 flex items-center space-x-1">
                <Avatar className="size-4">
                  <AvatarImage
                    src={`https://www.google.com/s2/favicons?domain=${getHostname(result.url)}`}
                    alt={getHostname(result.url)}
                  />
                  <AvatarFallback className="text-[8px]">
                    {getHostname(result.url)[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-xs opacity-60 truncate">
                  {displayUrlName(result.url)}
                </div>
              </div>
            </div>
          </Link>
        ))}
        
        {!showAllResults && additionalResultsCount > 0 && (
          <div className="border rounded-md flex items-center justify-center p-2 h-full">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs w-full h-full"
              onClick={handleViewMore}
            >
              Show {additionalResultsCount} more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
} 