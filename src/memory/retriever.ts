import { z } from 'zod';
import type { MicroClawDB } from '../db.js';

const ExternalQuerySchema = z.object({
  query: z.string().min(1),
  groupId: z.string().min(1),
  topK: z.number().int().positive().optional(),
  sourceType: z.string().min(1).optional(),
});

interface RetrievalResult {
  content: string;
  source: string;
  groupId: string;
  score: number;
  chunkId?: string;
}

class Retriever {
  private readonly db: MicroClawDB;
  readonly groupsDir: string;

  constructor(db: MicroClawDB, groupsDir?: string) {
    this.db = db;
    this.groupsDir = groupsDir ?? 'groups';
  }

  retrieve(query: string, groupId: string, topK = 5): RetrievalResult[] {
    const sanitized = this.sanitizeQuery(query);
    if (sanitized.length === 0) return [];

    const rows = this.db.searchMemory(sanitized, groupId, topK);
    return rows.map((row) => this.toRetrievalResult(row));
  }

  retrieveFrom(
    query: string,
    groupId: string,
    sourceType: string,
    topK = 5,
  ): RetrievalResult[] {
    const sanitized = this.sanitizeQuery(query);
    if (sanitized.length === 0) return [];

    const rows = this.db.searchMemory(sanitized, groupId, topK * 3);
    return rows
      .filter((row) => row.source_type === sourceType)
      .slice(0, topK)
      .map((row) => this.toRetrievalResult(row));
  }

  private toRetrievalResult(row: {
    chunk_id: string;
    content: string;
    group_id: string;
    source_type: string;
    rank: number;
  }): RetrievalResult {
    return {
      content: row.content,
      source: row.source_type,
      groupId: row.group_id,
      score: -row.rank,
      chunkId: row.chunk_id,
    };
  }

  private sanitizeQuery(query: string): string {
    return query.replace(/["*(){}:^~]/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export { Retriever, ExternalQuerySchema };
export type { RetrievalResult };
