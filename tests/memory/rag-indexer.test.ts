import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { betaclawDB } from '../../src/db.js';
import {
  RagIndexer,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
} from '../../src/memory/rag-indexer.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'betaclaw-rag-test-'));
}

describe('RagIndexer', () => {
  let db: betaclawDB;
  let indexer: RagIndexer;
  let tempDir: string;

  beforeEach(() => {
    tempDir = tmpDir();
    db = new betaclawDB(path.join(tempDir, 'test.db'));
    indexer = new RagIndexer(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('chunks text into correct segments', () => {
    const text = 'a'.repeat(1200);
    const chunks = indexer.chunkText(text);
    // step = 500 - 50 = 450
    // chunk 0: [0,500), chunk 1: [450,950), chunk 2: [900,1200)
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!).toHaveLength(DEFAULT_CHUNK_SIZE);
    expect(chunks[1]!).toHaveLength(DEFAULT_CHUNK_SIZE);
    expect(chunks[2]!).toHaveLength(300);
  });

  it('produces overlapping content between consecutive chunks', () => {
    const text = Array.from({ length: 1000 }, (_, i) => String.fromCharCode(65 + (i % 26))).join('');
    const chunks = indexer.chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);

    const overlapSize = DEFAULT_CHUNK_OVERLAP;
    const chunk0Tail = chunks[0]!.slice(-overlapSize);
    const chunk1Head = chunks[1]!.slice(0, overlapSize);
    expect(chunk0Tail).toBe(chunk1Head);
  });

  it('indexes a file and stores searchable chunks in DB', async () => {
    const file = path.join(tempDir, 'doc.txt');
    fs.writeFileSync(file, 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript');

    const count = await indexer.indexFile(file, 'grp_001', 'workspace');
    expect(count).toBeGreaterThan(0);

    const results = db.searchMemory('TypeScript', 'grp_001');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.content).toContain('TypeScript');
    expect(results[0]!.source_type).toBe('workspace');
  });

  it('re-indexes a file replacing old chunks', async () => {
    const file = path.join(tempDir, 'evolving.txt');
    fs.writeFileSync(file, 'original content about databases and queries');
    await indexer.indexFile(file, 'grp_001', 'workspace');

    const before = db.searchMemory('databases', 'grp_001');
    expect(before.length).toBeGreaterThan(0);

    fs.writeFileSync(file, 'updated content about networking and protocols');
    await indexer.reindexFile(file, 'grp_001', 'workspace');

    const oldResults = db.searchMemory('databases', 'grp_001');
    expect(oldResults).toHaveLength(0);

    const newResults = db.searchMemory('networking', 'grp_001');
    expect(newResults.length).toBeGreaterThan(0);
  });

  it('removes all chunks for a group and source type', () => {
    indexer.indexContent('workspace file content for testing', 'grp_001', 'workspace', 'file1');
    indexer.indexContent('skill documentation content here', 'grp_001', 'skill', 'skill1');

    indexer.removeSource('grp_001', 'workspace');

    const allRows = db.db
      .prepare('SELECT rowid, source_type, group_id FROM memory_fts')
      .all() as Array<{ rowid: number; source_type: string; group_id: string }>;

    const workspaceRows = allRows.filter(
      (r) => r.group_id === 'grp_001' && r.source_type === 'workspace',
    );
    const skillRows = allRows.filter(
      (r) => r.group_id === 'grp_001' && r.source_type === 'skill',
    );

    expect(workspaceRows).toHaveLength(0);
    expect(skillRows.length).toBeGreaterThan(0);
  });

  it('returns 0 chunks for empty content', () => {
    expect(indexer.indexContent('', 'grp_001', 'workspace', 'empty')).toBe(0);
    expect(indexer.indexContent('   \n\t  ', 'grp_001', 'workspace', 'ws')).toBe(0);
    expect(indexer.chunkText('')).toEqual([]);
  });

  it('produces multiple chunks for large content', () => {
    const largeText = 'alpha beta gamma delta '.repeat(200);
    const count = indexer.indexContent(largeText, 'grp_001', 'workspace', 'large-file');
    expect(count).toBeGreaterThan(1);

    const results = db.searchMemory('alpha', 'grp_001', 100);
    expect(results.length).toBe(count);
  });

  it('respects custom chunk configuration', () => {
    const custom = new RagIndexer(db, { maxChunkSize: 100, chunkOverlap: 10 });
    const text = 'x'.repeat(250);
    const chunks = custom.chunkText(text);
    // step = 100 - 10 = 90
    // [0,100), [90,190), [180,250) → 3 chunks
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!).toHaveLength(100);
    expect(chunks[1]!).toHaveLength(100);
    expect(chunks[2]!).toHaveLength(70);
  });

  it('validates chunk config with Zod', () => {
    expect(() => new RagIndexer(db, { maxChunkSize: -1 })).toThrow();
    expect(() => new RagIndexer(db, { chunkOverlap: -5 })).toThrow();
  });
});
