import { z } from 'zod';

const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  publishedDate: z.string().optional(),
});

const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  query: z.string(),
  provider: z.string(),
  totalResults: z.number().int(),
  durationMs: z.number(),
});

const SearchOptionsSchema = z.object({
  count: z.number().int().positive().optional(),
  freshness: z.enum(['day', 'week', 'month', 'year']).optional(),
  country: z.string().optional(),
});

type SearchResult = z.infer<typeof SearchResultSchema>;
type SearchResponse = z.infer<typeof SearchResponseSchema>;
type SearchOptions = z.infer<typeof SearchOptionsSchema>;

interface ISearchClient {
  id: string;
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
  isConfigured(): boolean;
}

export type { SearchResult, SearchResponse, SearchOptions, ISearchClient };
export { SearchResultSchema, SearchResponseSchema, SearchOptionsSchema };
