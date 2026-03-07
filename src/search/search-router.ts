import type { ISearchClient, SearchOptions, SearchResponse } from './interface.js';

class SearchRouter {
  private clients: ISearchClient[] = [];

  constructor(clients: ISearchClient[]) {
    this.clients = [...clients];
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    const configured = this.clients.filter((c) => c.isConfigured());

    if (configured.length === 0) {
      throw new Error('No search clients configured');
    }

    const errors: Error[] = [];

    for (const client of configured) {
      try {
        return await client.search(query, options);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    const details = errors
      .map((e, i) => {
        const clientId = configured[i]?.id ?? 'unknown';
        return `  ${clientId}: ${e.message}`;
      })
      .join('\n');

    throw new Error(`All search clients failed:\n${details}`);
  }

  addClient(client: ISearchClient): void {
    this.clients.push(client);
  }

  getAvailableClients(): string[] {
    return this.clients.filter((c) => c.isConfigured()).map((c) => c.id);
  }
}

export { SearchRouter };
