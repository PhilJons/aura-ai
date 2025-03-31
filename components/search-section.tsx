'use client'

import type { SearchResults as TypeSearchResults } from '@/lib/ai/tools/search'
import { ToolInvocation } from 'ai'
import { useChat } from 'ai/react'
import { CollapsibleMessage } from '@/components/collapsible-message'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchResults } from './search-results'
import { Section, ToolArgsSection } from '@/components/section'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'

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
              {queries.map((_, i) => (
                <Skeleton key={`q-${i}`} className="h-5 w-20 rounded-full" />
              ))}
            </div>
          </div>
        )}
        
        {/* Skeleton for sources/domains */}
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-20" /> {/* "Sources:" label */}
            <div className="flex flex-wrap gap-2">
              {sources.map((_, i) => (
                <Skeleton key={`s-${i}`} className="h-4 w-16 rounded-full" />
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Results skeletons */}
      {hasContent && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((_, i) => (
            <div key={i} className="overflow-hidden">
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

  return (
    <div className="max-w-2xl mx-auto w-full">
      <CollapsibleMessage
        role="assistant"
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
  // --- 1. Extract Data ---
  const allQueries = useMemo(() => 
    [...new Set(invocations.map(inv => inv.args?.query as string).filter(Boolean))], 
    [invocations]
  );
  const allSources = useMemo(() => 
    [...new Set(invocations.flatMap(inv => inv.args?.include_domains as string[] || []).filter(Boolean))], 
    [invocations]
  );
  const searchResults = useMemo(() => 
    invocations.map(inv => inv.state === 'result' ? (inv.result as TypeSearchResults) : undefined), 
    [invocations]
  );
  const isLoadingGroup = useMemo(() => 
    invocations.some(inv => inv.state === 'call'), 
    [invocations]
  );

  // --- 2. State for Collapsible ---
  const [isOpen, setIsOpen] = useState(true); // Default to open

  // --- 3. Prepare Header ---
  const headerContent = (
    <div className="flex flex-wrap gap-x-2 gap-y-1 p-1 items-center">
        <span className="font-medium mr-1 flex-shrink-0">Searching:</span>
        {allQueries.map((q, i) => (
          <span key={i} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-muted whitespace-nowrap">
            <span className="truncate max-w-[200px] sm:max-w-xs">{q}</span>
          </span>
        ))}
        {!isLoadingGroup && (
             <span className="text-xs text-muted-foreground ml-auto flex-shrink-0 pl-2">
                ({searchResults.reduce((acc, curr) => acc + (curr?.results?.length || 0), 0)} results)
             </span>
        )}
    </div>
  );

  // --- 4. Render Collapsible Message ---
  return (
    <div className="max-w-2xl mx-auto w-full">
      <CollapsibleMessage
        role="assistant"
        isCollapsible={true}
        header={headerContent}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      >
        {isLoadingGroup ? (
          <SearchSkeleton queries={allQueries} sources={allSources} />
        ) : (
          <Section title="Sources">
            {(() => {
              // 1. Aggregate all results from successful invocations
              const aggregatedResults = invocations.reduce((acc, inv) => {
                if (inv.state === 'result' && inv.result) {
                  const resultData = inv.result as TypeSearchResults;
                  if (resultData.results) {
                    // Add all results to our aggregated collection
                    acc.push(...resultData.results);
                  }
                }
                return acc;
              }, [] as TypeSearchResults['results']);

              // No results case
              if (aggregatedResults.length === 0) {
                return (
                  <div className="text-center text-muted-foreground py-4">
                    No results found for the search queries.
                  </div>
                );
              }

              // 2. Render SearchResults once with aggregated data
              return (
                <SearchResults
                  results={aggregatedResults}
                  // Pass all queries that led to these results
                  query={allQueries.join('; ')}
                  isLoading={false}
                />
              );
            })()}
          </Section>
        )}
      </CollapsibleMessage>
    </div>
  );
} 