import { tool } from 'ai';
import { z } from 'zod';

export const searchSchema = z.object({
  query: z.string().describe('The query to search for'),
  max_results: z
    .number()
    .optional()
    .default(10)
    .describe('The maximum number of results to return. Default is 10'),
  search_depth: z
    .enum(['basic', 'advanced'])
    .optional()
    .default('basic')
    .describe('The depth of the search. Allowed values are "basic" or "advanced"'),
  include_domains: z
    .array(z.string())
    .optional()
    .default([])
    .describe('A list of domains to specifically include in the search results. Default is empty array, which includes all domains.'),
  exclude_domains: z
    .array(z.string())
    .optional()
    .default([])
    .describe('A list of domains to specifically exclude from the search results. Default is empty array, which doesn\'t exclude any domains.')
});

export type SearchParams = z.infer<typeof searchSchema>;

export type SearchResultItem = {
  title: string;
  url: string;
  content: string;
};

export type SearchResults = {
  results: SearchResultItem[];
  query: string;
};

// Helper function to retry requests with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries = 3,
  initialDelay = 300,
  maxDelay = 2000
): Promise<T> {
  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Wait before retrying (except on first attempt)
      if (attempt > 0) {
        console.log(`[Tavily Search] Retry attempt ${attempt} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        // Exponential backoff with jitter
        delay = Math.min(delay * 1.5 + Math.random() * 100, maxDelay);
      }
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(`[Tavily Search] Attempt ${attempt} failed:`, error);
      
      // Don't retry on certain errors
      if (error instanceof Error && 
          (error.message.includes('API key is not configured') ||
           error.message.includes('Invalid API key'))) {
        throw error;
      }
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}

export const searchTool = tool({
  description: 'Search the web for up-to-date information using Tavily',
  parameters: searchSchema,
  execute: async ({ query, max_results = 10, search_depth = 'basic', include_domains = [], exclude_domains = [] }) => {
    try {
      // Ensure this is running server-side
      if (typeof window !== 'undefined') {
        console.error('[Tavily Search] Error: This function must run server-side');
        return {
          results: [],
          query: query
        } as SearchResults;
      }

      // Get API key from environment (no quotes)
      const tavilyApiKey = process.env.TAVILY_API_KEY?.replace(/"/g, '').trim();
      
      // Log a masked version of the API key for debugging (first 4 chars + last 4 chars)
      const maskedKey = tavilyApiKey 
        ? `${tavilyApiKey.substring(0, 4)}...${tavilyApiKey.substring(tavilyApiKey.length - 4)}`
        : 'missing';
      console.log(`[Tavily Search] Using API Key: ${maskedKey}`);
      
      if (!tavilyApiKey) {
        console.error('[Tavily Search] API key is missing or empty');
        throw new Error('Tavily API key is not configured');
      }

      // Create request body - try both ways of sending the API key
      const requestBody = {
        api_key: tavilyApiKey,
        query,
        max_results,
        search_depth,
        include_domains: include_domains.length > 0 ? include_domains : undefined,
        exclude_domains: exclude_domains.length > 0 ? exclude_domains : undefined
      };
      
      console.log(`[Tavily Search] Searching for: "${query}"`);
      
      // Use retry logic for the fetch operation
      const response = await retryWithBackoff(async () => {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': tavilyApiKey // Also try in header
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error(`[Tavily Search] Error Response: ${res.status} ${res.statusText}`, errorText);
          
          // Throw specific errors based on status codes
          if (res.status === 401) {
            throw new Error('Invalid API key or unauthorized');
          } else if (res.status === 429) {
            throw new Error('Rate limit exceeded');
          } else {
            throw new Error(`Server error: ${res.status} ${res.statusText}`);
          }
        }
        
        return res;
      });

      console.log(`[Tavily Search] Response received successfully`);

      const responseText = await response.text();
      
      // Try to parse the response as JSON
      let data;
      try {
        data = JSON.parse(responseText);
        console.log(`[Tavily Search] Got ${data.results?.length || 0} results`);
      } catch (parseError) {
        console.error('[Tavily Search] Error parsing response as JSON:', parseError);
        console.error('[Tavily Search] Raw response:', responseText);
        return {
          results: [],
          query: query
        } as SearchResults;
      }

      return {
        results: data.results || [],
        query: query
      } as SearchResults;
    } catch (error) {
      console.error('[Tavily Search] Error:', error);
      // Return empty results on error so the conversation can continue
      return {
        results: [],
        query: query
      } as SearchResults;
    }
  },
}); 