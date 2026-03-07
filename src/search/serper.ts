import { z } from 'zod';
import type { ISearchClient, SearchOptions, SearchResponse } from './interface.js';

type SecretAccessor = () => string;

const SerperOrganicResultSchema = z.object({
  title: z.string(),
  link: z.string(),
  snippet: z.string(),
  date: z.string().optional(),
  position: z.number().int().optional(),
});

const SerperSearchApiResponseSchema = z.object({
  searchParameters: z.object({
    q: z.string(),
  }),
  organic: z.array(SerperOrganicResultSchema).optional(),
});

const SERPER_FRESHNESS_MAP: Record<string, string> = {
  day: 'qdr:d',
  week: 'qdr:w',
  month: 'qdr:m',
  year: 'qdr:y',
};

class SerperSearchClient implements ISearchClient {
  readonly id = 'serper';
  readonly name = 'Serper (Google)';

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

    const body: Record<string, unknown> = {
      q: query,
      num: count,
    };

    if (options?.country) {
      body['gl'] = options.country;
    }

    if (options?.freshness) {
      const tbs = SERPER_FRESHNESS_MAP[options.freshness];
      if (tbs) {
        body['tbs'] = tbs;
      }
    }

    const apiKey = this.getApiKey();
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serper search failed: ${response.status} ${errorText}`);
    }

    const raw: unknown = await response.json();
    const parsed = SerperSearchApiResponseSchema.parse(raw);
    const durationMs = Date.now() - startTime;

    const organic = parsed.organic ?? [];
    const results = organic.map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      ...(r.date ? { publishedDate: r.date } : {}),
    }));

    return {
      results,
      query: parsed.searchParameters.q,
      provider: this.id,
      totalResults: results.length,
      durationMs,
    };
  }
}

export { SerperSearchClient, SerperSearchApiResponseSchema, SerperOrganicResultSchema };
