'use client'

import { CHAT_ID } from '@/lib/constants'
import type { SearchResults as TypeSearchResults } from '@/lib/ai/tools/search'
import { ToolInvocation } from 'ai'
import { useChat } from 'ai/react'
import { CollapsibleMessage } from './collapsible-message'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchResults } from './search-results'
import { Section, ToolArgsSection } from './section'

interface SearchSectionProps {
  tool: ToolInvocation
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchSkeleton() {
  return (
    <div className="flex flex-wrap">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="w-1/2 md:w-1/4 p-1">
          <div className="h-28 rounded-md border border-input bg-background">
            <div className="p-2 h-full flex flex-col justify-between">
              <Skeleton className="w-full h-8" />
              <div className="flex items-center space-x-1 mt-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        </div>
      ))}
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
    id: CHAT_ID || ''
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
    <CollapsibleMessage
      role="assistant"
      isCollapsible={true}
      header={header}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      {searchResults &&
        searchResults.images &&
        searchResults.images.length > 0 && (
          <Section>
            <SearchResultsImageSection
              images={searchResults.images}
              query={query}
            />
          </Section>
        )}
      {isToolLoading ? (
        <SearchSkeleton />
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
  )
} 