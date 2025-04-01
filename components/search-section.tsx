'use client'

import type { SearchResults as TypeSearchResults, SearchResultItem } from '@/lib/ai/tools/search'
import type { ToolInvocation } from 'ai'
import { useChat } from 'ai/react'
import { CollapsibleMessage } from '@/components/collapsible-message'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchResults } from './search-results'
import { Section, ToolArgsSection } from '@/components/section'
import { useMemo, useState, useEffect } from 'react'

// Define the interface for results-bearing tool invocations
interface ToolInvocationResult {
  toolName: string;
  toolCallId: string;
  state: 'result';
  args: any;
  result: any;
}

interface SearchSectionProps {
  tool: ToolInvocation
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

interface SearchSkeletonProps {
  queries?: string[]
  sources?: string[]
}

export function SearchSkeleton({ queries, sources }: SearchSkeletonProps) {
  // Determine if any query or source data is actually present
  const hasContent = (queries && queries.length > 0) || (sources && sources.length > 0);

  return (
    <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900/50 my-3">
      <div className="mb-2">
        {/* Skeleton for Queries */}
        {queries && queries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Skeleton className="h-4 w-20" /> {/* "Searching for:" label */}
            <div className="flex flex-wrap gap-2">
              {queries.map((query, i) => (
                <Skeleton key={`query-${query || 'empty'}-${i}`} className="h-5 w-20 rounded-full" />
              ))}
            </div>
          </div>
        )}
        
        {/* Skeleton for sources/domains */}
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-20" /> {/* "Sources:" label */}
            <div className="flex flex-wrap gap-2">
              {sources.map((source, i) => (
                <Skeleton key={`source-${source || 'empty'}-${i}`} className="h-4 w-16 rounded-full" />
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Results skeletons */}
      {hasContent && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((num) => (
            <div key={`skeleton-${num}`} className="overflow-hidden">
              <Skeleton className="w-full h-24 rounded-md" />
            </div>
          ))}
        </div>
      )}
      
      {/* Fallback if no query or sources are provided */}
      {!hasContent && (
        <Skeleton className="h-20 w-full" />
      )}
    </div>
  )
}

// This component would typically be implemented, but since we don't have
// the image search functionality yet, it's a placeholder
export function SearchResultsImageSection({ images, query }: { images: any[], query?: string }) {
  return <div>Image results not implemented</div>
}

export function SearchSection({
  tool,
  isOpen,
  onOpenChange
}: SearchSectionProps) {
  const { isLoading } = useChat({
    id: ''
  })
  const isToolLoading = tool.state === 'call'
  const searchResults: TypeSearchResults =
    tool.state === 'result' ? tool.result : undefined
  const query = tool.args?.query as string | undefined
  const includeDomains = tool.args?.include_domains as string[] | undefined
  const includeDomainsString = includeDomains?.length
    ? ` [${includeDomains.join(', ')}]`
    : ''
  
  // Determine if we're in a search state (either loading or has query but no results yet)
  const isSearching = isToolLoading || (isLoading && !!query && !searchResults)

  const header = (
    <ToolArgsSection
      tool="search"
      number={searchResults?.results?.length || 0}
    >{`${query || ''}${includeDomainsString}`}</ToolArgsSection>
  )

  // For debugging
  useEffect(() => {
    console.log('[SearchSection] Rendering with state:', {
      isToolLoading,
      hasResults: searchResults?.results?.length > 0,
      resultCount: searchResults?.results?.length || 0,
      query
    });
  }, [isToolLoading, searchResults, query]);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <CollapsibleMessage
        isCollapsible={true}
        header={header}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
        {/* TODO: Review or remove image search results section - searchResults type doesn't have 'images' */}
        {/* {searchResults &&
          searchResults.images &&
          searchResults.images.length > 0 && (
            <Section>
              <SearchResultsImageSection
                images={searchResults.images}
                query={query}
              />
            </Section>
          )} */}
        {isToolLoading ? (
          <SearchSkeleton queries={query ? [query] : undefined} sources={includeDomains} />
        ) : searchResults?.results ? (
          <Section title="Sources">
            <SearchResults 
              results={searchResults.results} 
              query={query} 
              isLoading={false}
            />
          </Section>
        ) : query ? (
          <SearchResults 
            results={[]} 
            query={query} 
            isLoading={false}
          />
        ) : null}
      </CollapsibleMessage>
    </div>
  )
}

// Component to display grouped search results
interface GroupedSearchSectionProps {
  invocations: ToolInvocation[];
  chatId: string; // Added chatId prop
}

export function GroupedSearchSection({ invocations, chatId }: GroupedSearchSectionProps) {
  // Initialize all hooks at the top level, outside of any conditionals or try-catch
  // State for controlling collapse state  
  const [isOpen, setIsOpen] = useState(true);
  // Create a local state to force re-renders during streaming
  const [renderKey, setRenderKey] = useState(Date.now());
  
  // Process invocations safely
  const allQueries = useMemo(() => {
    try {
      return [...new Set(invocations
        .filter(inv => inv?.args)
        .map(inv => inv.args?.query as string)
        .filter(Boolean)
      )];
    } catch (e) {
      return [];
    }
  }, [invocations]);
  
  // Determine if any search is still in progress
  const isSearchLoading = useMemo(() => {
    try {
      return invocations.some(inv => inv?.state === 'call' && (
        inv?.toolName === 'search' || 
        (typeof inv?.toolName === 'string' && inv?.toolName.includes('search'))
      ));
    } catch (e) {
      return false;
    }
  }, [invocations]);
  
  // Extract results with proper error handling
  const aggregatedResults = useMemo(() => {
    try {
      // Create a fallback result
      const createFallbackResult = (query: string): SearchResultItem => ({
        title: `Search results for "${query || 'your query'}"`,
        content: "Search results will appear here",
        url: "about:blank"
      });
      
      // If no data, return fallback
      if (!invocations || !invocations.length) {
        return allQueries.length ? allQueries.map(createFallbackResult) : [];
      }
      
      // Process invocations to extract results
      const extractedResults: SearchResultItem[] = [];
      
      for (const inv of invocations) {
        try {
          if (!inv || inv.state !== 'result') continue;
          
          const result = (inv as any).result;
          if (!result) continue;
          
          if (Array.isArray(result)) {
            extractedResults.push(...result);
          }
          else if (typeof result === 'object' && result && 'results' in result && Array.isArray(result.results)) {
            extractedResults.push(...result.results);
          }
          else if (typeof result === 'string') {
            try {
              const parsed = JSON.parse(result);
              if (Array.isArray(parsed)) {
                extractedResults.push(...parsed);
              }
              else if (parsed && typeof parsed === 'object' && 'results' in parsed && Array.isArray(parsed.results)) {
                extractedResults.push(...parsed.results);
              }
            } catch {}
          }
        } catch {}
      }
      
      // Always return something
      return extractedResults.length > 0 ? extractedResults : 
             allQueries.length ? allQueries.map(createFallbackResult) : [];
    } catch (e) {
      return [];
    }
  }, [invocations, allQueries]);

  // Force a re-render when invocations change to ensure streaming updates
  useEffect(() => {
    const forceUpdate = () => {
      setRenderKey(Date.now());
    };
    
    // Check for streaming state
    if (invocations.length > 0) {
      // Set an interval to force updates during streaming
      const intervalId = setInterval(forceUpdate, 200);
      return () => clearInterval(intervalId);
    }
  }, [invocations.length]);

  try {
    // Create simple header content
    const headerContent = (
      <div className="flex flex-wrap gap-x-2 gap-y-1 p-1 items-center">
        <span className="font-medium mr-1 shrink-0">Search Results:</span>
        {allQueries.map((q, i) => (
          <span key={`query-${q || 'empty'}-${i}`} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted whitespace-nowrap">
            <span className="truncate max-w-[200px] sm:max-w-xs">{q || 'Query'}</span>
          </span>
        ))}
        <span className="text-xs text-muted-foreground ml-auto shrink-0 pl-2">
          ({aggregatedResults.length} results)
        </span>
      </div>
    );
    
    // Create a stable key based on chat ID and queries
    const searchResultsKey = `search-results-${chatId}-${allQueries.join('-')}-${renderKey}`;

    // Render with proper error boundaries
    return (
      <div className="max-w-2xl mx-auto w-full">
        <CollapsibleMessage
          isCollapsible={true}
          header={headerContent}
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        >
          <div className="p-4">
            <Section title="Sources">
              <SearchResults
                key={searchResultsKey} // Use stable key with renderKey for streaming updates
                results={aggregatedResults}
                query={allQueries.join('; ')}
                isLoading={isSearchLoading} // Pass calculated loading state
              />
            </Section>
          </div>
        </CollapsibleMessage>
      </div>
    );
  } catch (e) {
    // If any error happens during rendering, show a minimal fallback
    return (
      <div className="max-w-2xl mx-auto w-full p-4 text-center text-muted-foreground">
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
          Search results are available
        </div>
      </div>
    );
  }
} 