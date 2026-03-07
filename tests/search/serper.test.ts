import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SerperSearchClient } from '../../src/search/serper.js';

function makeSerperResponse(overrides: Record<string, unknown> = {}) {
  return {
    searchParameters: { q: 'test query' },
    organic: [
      {
        title: 'Google Result',
        link: 'https://google.example.com',
        snippet: 'A Google snippet',
        date: '2025-03-01',
        position: 1,
      },
    ],
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

describe('SerperSearchClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('has correct id and name', () => {
    const client = new SerperSearchClient(() => 'test-key');
    expect(client.id).toBe('serper');
    expect(client.name).toBe('Serper (Google)');
  });

  it('isConfigured returns true when key is present', () => {
    const client = new SerperSearchClient(() => 'serper-key-123');
    expect(client.isConfigured()).toBe(true);
  });

  it('isConfigured returns false when key is empty', () => {
    const client = new SerperSearchClient(() => '');
    expect(client.isConfigured()).toBe(false);
  });

  it('isConfigured returns false when accessor throws', () => {
    const client = new SerperSearchClient(() => {
      throw new Error('no key');
    });
    expect(client.isConfigured()).toBe(false);
  });

  it('constructs correct POST request with headers and body', async () => {
    const fetchSpy = mockFetchOk(makeSerperResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const client = new SerperSearchClient(() => 'serper-api-key');
    await client.search('test query', { count: 8, country: 'US' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://google.serper.dev/search');
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['X-API-KEY']).toBe('serper-api-key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['q']).toBe('test query');
    expect(body['num']).toBe(8);
    expect(body['gl']).toBe('US');
  });

  it('validates API response with Zod and rejects invalid data', async () => {
    const fetchSpy = mockFetchOk({ completely: 'invalid' });
    vi.stubGlobal('fetch', fetchSpy);

    const client = new SerperSearchClient(() => 'key');
    await expect(client.search('test')).rejects.toThrow();
  });

  it('maps freshness to tbs parameter', async () => {
    const fetchSpy = mockFetchOk(makeSerperResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const client = new SerperSearchClient(() => 'key');
    await client.search('test query', { freshness: 'day' });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['tbs']).toBe('qdr:d');
  });

  it('maps all freshness values correctly', async () => {
    const client = new SerperSearchClient(() => 'key');
    const mapping = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m', year: 'qdr:y' } as const;

    for (const [freshness, expected] of Object.entries(mapping)) {
      const fetchSpy = mockFetchOk(makeSerperResponse());
      vi.stubGlobal('fetch', fetchSpy);

      await client.search('q', { freshness: freshness as 'day' | 'week' | 'month' | 'year' });

      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body['tbs']).toBe(expected);
    }
  });

  it('maps search results to SearchResponse format', async () => {
    const fetchSpy = mockFetchOk(makeSerperResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const client = new SerperSearchClient(() => 'key');
    const result = await client.search('test query');

    expect(result.provider).toBe('serper');
    expect(result.query).toBe('test query');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toEqual({
      title: 'Google Result',
      url: 'https://google.example.com',
      snippet: 'A Google snippet',
      publishedDate: '2025-03-01',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws on HTTP error response', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });
    vi.stubGlobal('fetch', fetchSpy);

    const client = new SerperSearchClient(() => 'key');
    await expect(client.search('test')).rejects.toThrow('Serper search failed: 403 Forbidden');
  });

  it('handles response with no organic results', async () => {
    const fetchSpy = mockFetchOk({
      searchParameters: { q: 'nothing' },
    });
    vi.stubGlobal('fetch', fetchSpy);

    const client = new SerperSearchClient(() => 'key');
    const result = await client.search('nothing');

    expect(result.results).toEqual([]);
    expect(result.totalResults).toBe(0);
  });
});
