import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { betaclawDB } from '../db.js';

const ExternalChunkConfigSchema = z.object({
  maxChunkSize: z.number().int().positive().optional(),
  chunkOverlap: z.number().int().nonnegative().optional(),
});

interface ChunkConfig {
  maxChunkSize: number;
  chunkOverlap: number;
}

const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 50;

class RagIndexer {
  private readonly db: betaclawDB;
  private readonly config: ChunkConfig;

  constructor(db: betaclawDB, config?: Partial<ChunkConfig>) {
    const validated = ExternalChunkConfigSchema.parse(config ?? {});
    this.db = db;
    this.config = {
      maxChunkSize: validated.maxChunkSize ?? DEFAULT_CHUNK_SIZE,
      chunkOverlap: validated.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
    };
  }

  async indexFile(filePath: string, groupId: string, sourceType: string): Promise<number> {
    const content = await readFile(resolve(filePath), 'utf-8');
    return this.indexContent(content, groupId, sourceType, filePath);
  }

  indexContent(content: string, groupId: string, sourceType: string, sourceId: string): number {
    if (content.trim().length === 0) return 0;

    const chunks = this.chunkText(content);
    const prefix = this.sourcePrefix(sourceId);

    this.db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        this.db.insertMemoryChunk(`${prefix}#chunk-${i}`, chunks[i]!, groupId, sourceType);
      }
    });

    return chunks.length;
  }

  async reindexFile(filePath: string, groupId: string, sourceType: string): Promise<number> {
    this.removeChunksBySourceId(filePath, groupId);
    return this.indexFile(filePath, groupId, sourceType);
  }

  removeSource(groupId: string, sourceType: string): void {
    const rows = this.db.db
      .prepare('SELECT rowid, group_id, source_type FROM memory_fts')
      .all() as Array<{ rowid: number; group_id: string; source_type: string }>;

    const del = this.db.db.prepare('DELETE FROM memory_fts WHERE rowid = ?');
    for (const row of rows) {
      if (row.group_id === groupId && row.source_type === sourceType) {
        del.run(row.rowid);
      }
    }
  }

  chunkText(text: string): string[] {
    if (text.trim().length === 0) return [];

    const { maxChunkSize, chunkOverlap } = this.config;
    const step = Math.max(1, maxChunkSize - chunkOverlap);
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + maxChunkSize, text.length);
      const chunk = text.slice(start, end);
      if (chunk.trim().length > 0) {
        chunks.push(chunk);
      }
      if (end >= text.length) break;
      start += step;
    }

    return chunks;
  }

  private removeChunksBySourceId(sourceId: string, groupId: string): void {
    const prefix = this.sourcePrefix(sourceId) + '#';
    const rows = this.db.db
      .prepare('SELECT rowid, chunk_id, group_id FROM memory_fts')
      .all() as Array<{ rowid: number; chunk_id: string; group_id: string }>;

    const del = this.db.db.prepare('DELETE FROM memory_fts WHERE rowid = ?');
    for (const row of rows) {
      if (row.group_id === groupId && row.chunk_id.startsWith(prefix)) {
        del.run(row.rowid);
      }
    }
  }

  private sourcePrefix(sourceId: string): string {
    return createHash('sha256').update(sourceId).digest('hex').slice(0, 16);
  }
}

export { RagIndexer, ExternalChunkConfigSchema, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP };
export type { ChunkConfig };
