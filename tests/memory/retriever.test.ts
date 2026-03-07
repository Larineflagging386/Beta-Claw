import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MicroClawDB } from '../../src/db.js';
import { Retriever } from '../../src/memory/retriever.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'microclaw-retriever-test-'));
}

describe('Retriever', () => {
  let db: MicroClawDB;
  let retriever: Retriever;
  let tempDir: string;

  beforeEach(() => {
    tempDir = tmpDir();
    db = new MicroClawDB(path.join(tempDir, 'test.db'));
    retriever = new Retriever(db);

    db.insertMemoryChunk(
      'chunk-1',
      'TypeScript is a typed superset of JavaScript',
      'grp_001',
      'workspace',
    );
    db.insertMemoryChunk(
      'chunk-2',
      'Python is great for machine learning applications',
      'grp_001',
      'workspace',
    );
    db.insertMemoryChunk(
      'chunk-3',
      'User prefers dark mode and vim keybindings',
      'grp_001',
      'episodic',
    );
    db.insertMemoryChunk(
      'chunk-4',
      'React hooks were introduced in version sixteen',
      'grp_002',
      'workspace',
    );
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('retrieves relevant results for a query', () => {
    const results = retriever.retrieve('TypeScript', 'grp_001');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.content).toContain('TypeScript');
    expect(results[0]!.source).toBe('workspace');
    expect(results[0]!.groupId).toBe('grp_001');
    expect(results[0]!.score).toBeGreaterThan(0);
    expect(results[0]!.chunkId).toBe('chunk-1');
  });

  it('filters results by groupId', () => {
    const grp1Results = retriever.retrieve('TypeScript', 'grp_001');
    expect(grp1Results.length).toBeGreaterThan(0);
    expect(grp1Results.every((r) => r.groupId === 'grp_001')).toBe(true);

    const grp2Results = retriever.retrieve('TypeScript', 'grp_002');
    expect(grp2Results).toHaveLength(0);
  });

  it('respects topK limit', () => {
    const results = retriever.retrieve('TypeScript', 'grp_001', 1);
    expect(results).toHaveLength(1);
  });

  it('filters by sourceType with retrieveFrom', () => {
    const episodic = retriever.retrieveFrom('dark mode', 'grp_001', 'episodic');
    expect(episodic.length).toBeGreaterThan(0);
    expect(episodic.every((r) => r.source === 'episodic')).toBe(true);

    const workspace = retriever.retrieveFrom('dark mode', 'grp_001', 'workspace');
    expect(workspace).toHaveLength(0);
  });

  it('returns empty for blank or special-char-only queries', () => {
    expect(retriever.retrieve('', 'grp_001')).toEqual([]);
    expect(retriever.retrieve('   ', 'grp_001')).toEqual([]);
    expect(retriever.retrieve('***', 'grp_001')).toEqual([]);
  });

  it('returns empty for queries that match nothing', () => {
    const results = retriever.retrieve('xylophonequartzblitz', 'grp_001');
    expect(results).toHaveLength(0);
  });

  it('returns results with positive scores', () => {
    const results = retriever.retrieve('machine learning', 'grp_001');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });
});
