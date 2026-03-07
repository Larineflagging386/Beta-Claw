import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BraveSearchClient } from '../../src/search/brave.js';

function makeBraveResponse(overrides: Record<string, unknown> = {}) {
  return {
    query: { original: 'test query' },
    web: {
      results: [
        {
          title: 'Example Result',
          url: 'https://example.com',
          description: 'An example snippet',
          page_age: '2025-01-15',
        },
      ],
      totalEstimatedMatches: 1200,
    },
    ...overrides,
  };
}

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe('BraveSearchClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct id and name', () => {
    const client = new BraveSearchClient(() => 'test-key');
    expect(client.id).toBe('brave');
    expect(client.name).toBe('Brave Search');
  });

  it('isConfigured returns true when key is present', () => {
    const client = new BraveSearchClient(() => 'sk-brave-123');
    expect(client.isConfigured()).toBe(true);
  });

  it('isConfigured returns false when key is empty', () => {
    const client = new BraveSearchClient(() => '');
    expect(client.isConfigured()).toBe(false);
  });

  it('isConfigured returns false when accessor throws', () => {
    const client = new BraveSearchClient(() => {
      throw new Error('vault sealed');
    });
    expect(client.isConfigured()).toBe(false);
  });

  it('constructs correct URL and headers', async () => {
    const fetchSpy = mockFetchOk(makeBraveResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const client = new BraveSearchClient(() => 'brave-api-key');
    await client.search('test query', { count: 10, freshness: 'week', country: 'US' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

    expect(url).toContain('https://api.search.brave.com/res/v1/web/search');
    expect(url).toContain('q=test+query');
    expect(url).toContain('count=10');
    expect(url).toContain('freshness=pw');
    expect(url).toContain('country=US');

    const headers = init.headers as Record<string, string>;
    expect(headers['X-Subscription-Token']).toBe('brave-api-key');
    expect(headers['Accept']).toBe('application/json');
  });

  it('validates API response with Zod and rejects invalid data', async () => {
    const fetchSpy = mockFetchOk({ totally: 'wrong' });
    vi.stubGlobal('fetch', fetchSpy);

    const client = new BraveSearchClient(() => 'key');
    await expect(client.search('test')).rejects.toThrow();
  });

  it('encodes special characters in query', async () => {
    const fetchSpy = mockFetchOk(
      makeBraveResponse({ query: { original: 'c++ tutorials & tricks' } }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const client = new BraveSearchClient(() => 'key');
    await client.search('c++ tutorials & tricks');

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('q=c%2B%2B+tutorials+%26+tricks');
  });

  it('maps search results to SearchResponse format', async () => {
    const fetchSpy = mockFetchOk(makeBraveResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const client = new BraveSearchClient(() => 'key');
    const result = await client.search('test query');

    expect(result.provider).toBe('brave');
    expect(result.query).toBe('test query');
    expect(result.totalResults).toBe(1200);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      title: 'Example Result',
      url: 'https://example.com',
      snippet: 'An example snippet',
      publishedDate: '2025-01-15',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws on HTTP error response', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const client = new BraveSearchClient(() => 'key');
    await expect(client.search('test')).rejects.toThrow('Brave search failed: 429 Rate limited');
  });

  it('uses default count of 5 when no options provided', async () => {
    const fetchSpy = mockFetchOk(makeBraveResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const client = new BraveSearchClient(() => 'key');
    await client.search('test query');

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('count=5');
  });

  it('handles response with no web results', async () => {
    const fetchSpy = mockFetchOk({
      query: { original: 'obscure query' },
    });
    vi.stubGlobal('fetch', fetchSpy);

    const client = new BraveSearchClient(() => 'key');
    const result = await client.search('obscure query');

    expect(result.results).toEqual([]);
    expect(result.totalResults).toBe(0);
  });
});
