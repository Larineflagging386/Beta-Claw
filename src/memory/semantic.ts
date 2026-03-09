import { z } from 'zod';
import type { betaclawDB } from '../db.js';

interface SearchResult {
  chunkId: string;
  content: string;
  groupId: string;
  sourceType: string;
  score: number;
}

const SOURCE_TYPES = ['session_summary', 'episodic', 'workspace', 'skill_doc'] as const;
const SourceTypeSchema = z.enum(SOURCE_TYPES);

const IndexInputSchema = z.object({
  chunkId: z.string().min(1),
  content: z.string().min(1),
  groupId: z.string().min(1),
  sourceType: SourceTypeSchema,
});

const SearchQuerySchema = z.string().min(1);

class SemanticMemory {
  private readonly db: betaclawDB;

  constructor(db: betaclawDB) {
    this.db = db;
  }

  index(chunkId: string, content: string, groupId: string, sourceType: string): void {
    const validated = IndexInputSchema.parse({ chunkId, content, groupId, sourceType });
    this.db.insertMemoryChunk(
      validated.chunkId,
      validated.content,
      validated.groupId,
      validated.sourceType,
    );
  }

  search(query: string, groupId?: string, limit?: number): SearchResult[] {
    const validatedQuery = SearchQuerySchema.parse(query);
    const results = this.db.searchMemory(validatedQuery, groupId, limit ?? 5);
    return results.map(row => ({
      chunkId: row.chunk_id,
      content: row.content,
      groupId: row.group_id,
      sourceType: row.source_type,
      score: -row.rank,
    }));
  }

  removeBySource(groupId: string, sourceType: string): void {
    this.db.db
      .prepare('DELETE FROM memory_fts WHERE group_id = ? AND source_type = ?')
      .run(groupId, sourceType);
  }
}

export { SemanticMemory, SourceTypeSchema };
export type { SearchResult };
