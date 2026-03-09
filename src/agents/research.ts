import { encode } from '../core/toon-serializer.js';
import { ToolCache } from '../core/tool-cache.js';
import { SearchRouter } from '../search/search-router.js';
import { BraveSearchClient } from '../search/brave.js';
import { SerperSearchClient } from '../search/serper.js';
import { Retriever } from '../memory/retriever.js';
import { betaclawDB } from '../db.js';
import { DB_PATH } from '../core/paths.js';
import type { AgentTask, AgentResult, IAgent } from './types.js';
import { AgentTaskSchema } from './types.js';

function extractQuery(brief: string): string {
  const prefixPatterns = [
    /^(?:research|search|find|lookup|look up|google|browse)[:\s]+/i,
    /^(?:default research|Research)[:\s]+/i,
  ];
  let query = brief;
  for (const p of prefixPatterns) {
    query = query.replace(p, '');
  }
  return query.trim() || brief;
}

export class ResearchAgent implements IAgent {
  readonly type = 'research' as const;

  private db: betaclawDB | null = null;

  static setDB(db: betaclawDB): void {
    ResearchAgent._sharedDB = db;
  }
  private static _sharedDB: betaclawDB | null = null;

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();
    const query = extractQuery(validated.brief);

    if (!this.db && !ResearchAgent._sharedDB) {
      const { mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      mkdirSync(dirname(DB_PATH), { recursive: true });
    }
    const db = this.db ?? ResearchAgent._sharedDB ?? new betaclawDB(DB_PATH);
    const toolCache = new ToolCache(db, validated.groupId);
    const retriever = new Retriever(db);

    const sources: Array<{ title: string; url: string; snippet: string }> = [];
    const localContext: string[] = [];
    let summary = '';

    const cached = toolCache.get('brave_search', { query }) ??
                   toolCache.get('serper_search', { query });
    if (cached) {
      summary = cached;
    } else {
      const searchClients = [];
      if (process.env['BRAVE_API_KEY']) {
        searchClients.push(new BraveSearchClient(() => process.env['BRAVE_API_KEY']!));
      }
      if (process.env['SERPER_API_KEY']) {
        searchClients.push(new SerperSearchClient(() => process.env['SERPER_API_KEY']!));
      }

      if (searchClients.length > 0) {
        const router = new SearchRouter(searchClients);
        try {
          const webResults = await router.search(query, { count: 5 });
          for (const r of webResults.results) {
            sources.push({ title: r.title, url: r.url, snippet: r.snippet });
          }
          const resultToon = encode('web_results', {
            query,
            provider: webResults.provider,
            results: webResults.results.map(r => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
            })),
          } as Record<string, unknown>);
          const toolName = webResults.provider === 'brave' ? 'brave_search' : 'serper_search';
          toolCache.set(toolName, { query }, resultToon);
          summary = webResults.results.map(r => `${r.title}: ${r.snippet}`).join('\n');
        } catch {
          summary = 'Web search failed; falling back to local context.';
        }
      }
    }

    const ragResults = retriever.retrieve(query, validated.groupId, 5);
    for (const r of ragResults) {
      localContext.push(r.content);
    }

    if (!summary && localContext.length > 0) {
      summary = 'Based on local memory:\n' + localContext.join('\n---\n');
    } else if (!summary && localContext.length === 0) {
      summary = 'No search providers configured and no relevant local context found.';
    } else if (summary && localContext.length > 0) {
      summary += '\n\nLocal context:\n' + localContext.join('\n---\n');
    }

    const output = encode('findings', {
      query,
      sources,
      localContext,
      summary,
    } as Record<string, unknown>);

    const durationMs = performance.now() - start;

    return {
      taskId: validated.id,
      agentType: this.type,
      output,
      tokensUsed: Math.ceil(output.length / 4),
      durationMs,
    };
  }
}
