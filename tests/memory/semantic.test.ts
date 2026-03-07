import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MicroClawDB } from '../../src/db.js';
import { SemanticMemory } from '../../src/memory/semantic.js';

describe('SemanticMemory', () => {
  let tmpDir: string;
  let db: MicroClawDB;
  let memory: SemanticMemory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    db = new MicroClawDB(dbPath);
    memory = new SemanticMemory(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes a chunk and searches for it', () => {
    memory.index('chunk-1', 'The quick brown fox jumps over the lazy dog', 'group-1', 'workspace');

    const results = memory.search('fox', 'group-1');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.chunkId).toBe('chunk-1');
    expect(results[0]!.content).toContain('fox');
  });

  it('returns relevant results for matching queries', () => {
    memory.index('c1', 'Python programming language tutorial', 'g1', 'workspace');
    memory.index('c2', 'JavaScript web development framework', 'g1', 'workspace');
    memory.index('c3', 'Python data science and machine learning', 'g1', 'workspace');

    const results = memory.search('Python', 'g1');
    expect(results.length).toBeGreaterThanOrEqual(2);

    const chunkIds = results.map(r => r.chunkId);
    expect(chunkIds).toContain('c1');
    expect(chunkIds).toContain('c3');
  });

  it('filters search results by groupId', () => {
    memory.index('c1', 'shared topic about databases', 'group-a', 'workspace');
    memory.index('c2', 'shared topic about databases and queries', 'group-b', 'workspace');

    const resultsA = memory.search('databases', 'group-a');
    expect(resultsA.length).toBe(1);
    expect(resultsA[0]!.groupId).toBe('group-a');

    const resultsB = memory.search('databases', 'group-b');
    expect(resultsB.length).toBe(1);
    expect(resultsB[0]!.groupId).toBe('group-b');
  });

  it('returns all groups when groupId is omitted', () => {
    memory.index('c1', 'universal search term alpha', 'group-a', 'workspace');
    memory.index('c2', 'universal search term alpha repeated', 'group-b', 'workspace');

    const results = memory.search('alpha');
    expect(results.length).toBe(2);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      memory.index(`c${i}`, `document number ${i} about testing`, 'g1', 'workspace');
    }

    const results = memory.search('testing', 'g1', 3);
    expect(results.length).toBe(3);
  });

  it('removes chunks by source type', () => {
    memory.index('c1', 'session summary data first', 'g1', 'session_summary');
    memory.index('c2', 'workspace data second', 'g1', 'workspace');
    memory.index('c3', 'another session summary third', 'g1', 'session_summary');

    memory.removeBySource('g1', 'session_summary');

    const summaryResults = memory.search('summary', 'g1');
    const summaryChunks = summaryResults.filter(r => r.sourceType === 'session_summary');
    expect(summaryChunks.length).toBe(0);

    const workspaceResults = memory.search('workspace', 'g1');
    expect(workspaceResults.length).toBe(1);
    expect(workspaceResults[0]!.sourceType).toBe('workspace');
  });

  it('returns empty array for non-matching search', () => {
    memory.index('c1', 'completely unrelated content here', 'g1', 'workspace');

    const results = memory.search('xyznonexistent', 'g1');
    expect(results).toEqual([]);
  });

  it('indexes multiple chunks and assigns positive scores', () => {
    memory.index('c1', 'machine learning algorithms for classification', 'g1', 'workspace');
    memory.index('c2', 'deep learning neural networks', 'g1', 'workspace');
    memory.index('c3', 'learning management system for education', 'g1', 'workspace');

    const results = memory.search('learning', 'g1');
    expect(results.length).toBe(3);

    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
      expect(result.chunkId).toBeTruthy();
      expect(result.content).toBeTruthy();
    }
  });

  it('validates source type via Zod and rejects invalid types', () => {
    expect(() => {
      memory.index('c1', 'test content', 'g1', 'invalid_type');
    }).toThrow();
  });

  it('returns SearchResult with all expected fields', () => {
    memory.index('test-chunk', 'sample content for testing fields', 'test-group', 'episodic');

    const results = memory.search('sample', 'test-group');
    expect(results.length).toBe(1);

    const result = results[0]!;
    expect(result).toHaveProperty('chunkId', 'test-chunk');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('groupId', 'test-group');
    expect(result).toHaveProperty('sourceType', 'episodic');
    expect(result).toHaveProperty('score');
    expect(typeof result.score).toBe('number');
  });
});
