import { z } from 'zod';
import type { ISearchClient, SearchOptions, SearchResponse } from './interface.js';

type SecretAccessor = () => string;

const BraveWebResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string(),
  page_age: z.string().optional(),
});

const BraveSearchApiResponseSchema = z.object({
  query: z.object({
    original: z.string(),
  }),
  web: z
    .object({
      results: z.array(BraveWebResultSchema),
      totalEstimatedMatches: z.number().int().optional(),
    })
    .optional(),
});

const FRESHNESS_MAP: Record<string, string> = {
  day: 'pd',
  week: 'pw',
  month: 'pm',
  year: 'py',
};

class BraveSearchClient implements ISearchClient {
  readonly id = 'brave';
  readonly name = 'Brave Search';

  private readonly getApiKey: SecretAccessor;

  constructor(apiKeyAccessor: SecretAccessor) {
    this.getApiKey = apiKeyAccessor;
  }

  isConfigured(): boolean {
    try {
      return this.getApiKey().length > 0;
    } catch {
      return false;
    }
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    const count = options?.count ?? 5;

    const params = new URLSearchParams({
      q: query,
      count: String(count),
    });

    if (options?.freshness) {
      const mapped = FRESHNESS_MAP[options.freshness];
      if (mapped) {
        params.set('freshness', mapped);
      }
    }

    if (options?.country) {
      params.set('country', options.country);
    }

    const apiKey = this.getApiKey();
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'X-Subscription-Token': apiKey,
          'Accept': 'application/json',
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brave search failed: ${response.status} ${errorText}`);
    }

    const raw: unknown = await response.json();
    const parsed = BraveSearchApiResponseSchema.parse(raw);
    const durationMs = Date.now() - startTime;

    const results = (parsed.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      ...(r.page_age ? { publishedDate: r.page_age } : {}),
    }));

    return {
      results,
      query: parsed.query.original,
      provider: this.id,
      totalResults: parsed.web?.totalEstimatedMatches ?? results.length,
      durationMs,
    };
  }
}

export { BraveSearchClient, BraveSearchApiResponseSchema, BraveWebResultSchema };
