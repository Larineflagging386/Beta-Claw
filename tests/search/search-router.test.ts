import { describe, it, expect, vi } from 'vitest';
import { SearchRouter } from '../../src/search/search-router.js';
import type { ISearchClient, SearchResponse } from '../../src/search/interface.js';

function makeSearchResponse(provider: string): SearchResponse {
  return {
    results: [{ title: 'Result', url: 'https://example.com', snippet: 'snippet' }],
    query: 'test',
    provider,
    totalResults: 1,
    durationMs: 42,
  };
}

function createMockClient(
  id: string,
  configured: boolean,
  searchResult?: SearchResponse | Error,
): ISearchClient {
  return {
    id,
    name: `Mock ${id}`,
    isConfigured: vi.fn().mockReturnValue(configured),
    search: vi.fn().mockImplementation(() => {
      if (searchResult instanceof Error) {
        return Promise.reject(searchResult);
      }
      return Promise.resolve(searchResult ?? makeSearchResponse(id));
    }),
  };
}

describe('SearchRouter', () => {
  it('uses first available configured client', async () => {
    const clientA = createMockClient('alpha', true);
    const clientB = createMockClient('beta', true);
    const router = new SearchRouter([clientA, clientB]);

    const result = await router.search('test');

    expect(result.provider).toBe('alpha');
    expect(clientA.search).toHaveBeenCalledOnce();
    expect(clientB.search).not.toHaveBeenCalled();
  });

  it('falls back to second client when first fails', async () => {
    const clientA = createMockClient('alpha', true, new Error('API down'));
    const clientB = createMockClient('beta', true);
    const router = new SearchRouter([clientA, clientB]);

    const result = await router.search('test');

    expect(result.provider).toBe('beta');
    expect(clientA.search).toHaveBeenCalledOnce();
    expect(clientB.search).toHaveBeenCalledOnce();
  });

  it('throws if no clients are configured', async () => {
    const clientA = createMockClient('alpha', false);
    const clientB = createMockClient('beta', false);
    const router = new SearchRouter([clientA, clientB]);

    await expect(router.search('test')).rejects.toThrow('No search clients configured');
  });

  it('throws with aggregated error when all clients fail', async () => {
    const clientA = createMockClient('alpha', true, new Error('timeout'));
    const clientB = createMockClient('beta', true, new Error('rate limit'));
    const router = new SearchRouter([clientA, clientB]);

    await expect(router.search('test')).rejects.toThrow('All search clients failed');
    try {
      await router.search('test');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('alpha: timeout');
      expect(msg).toContain('beta: rate limit');
    }
  });

  it('getAvailableClients lists only configured clients', () => {
    const clientA = createMockClient('alpha', true);
    const clientB = createMockClient('beta', false);
    const clientC = createMockClient('gamma', true);
    const router = new SearchRouter([clientA, clientB, clientC]);

    const available = router.getAvailableClients();
    expect(available).toEqual(['alpha', 'gamma']);
  });

  it('addClient appends a new client', () => {
    const router = new SearchRouter([]);
    expect(router.getAvailableClients()).toEqual([]);

    const client = createMockClient('added', true);
    router.addClient(client);

    expect(router.getAvailableClients()).toEqual(['added']);
  });

  it('respects registration order for preference', async () => {
    const clientA = createMockClient('first', true);
    const clientB = createMockClient('second', true);
    const clientC = createMockClient('third', true);
    const router = new SearchRouter([clientA, clientB, clientC]);

    const result = await router.search('test');
    expect(result.provider).toBe('first');
    expect(clientB.search).not.toHaveBeenCalled();
    expect(clientC.search).not.toHaveBeenCalled();
  });

  it('handles empty clients list', async () => {
    const router = new SearchRouter([]);

    expect(router.getAvailableClients()).toEqual([]);
    await expect(router.search('test')).rejects.toThrow('No search clients configured');
  });

  it('skips unconfigured clients and uses first configured one', async () => {
    const clientA = createMockClient('alpha', false);
    const clientB = createMockClient('beta', true);
    const router = new SearchRouter([clientA, clientB]);

    const result = await router.search('test');

    expect(result.provider).toBe('beta');
    expect(clientA.search).not.toHaveBeenCalled();
    expect(clientB.search).toHaveBeenCalledOnce();
  });

  it('passes options through to the search client', async () => {
    const client = createMockClient('alpha', true);
    const router = new SearchRouter([client]);

    await router.search('query', { count: 10, freshness: 'week', country: 'DE' });

    expect(client.search).toHaveBeenCalledWith('query', {
      count: 10,
      freshness: 'week',
      country: 'DE',
    });
  });
});
