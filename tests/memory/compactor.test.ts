import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Compactor } from '../../src/memory/compactor.js';
import type { CompactionResult } from '../../src/memory/compactor.js';
import { betaclawDB } from '../../src/db.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function makeTempDb(): { db: betaclawDB; dbPath: string } {
  const dbPath = path.join(
    os.tmpdir(),
    `betaclaw-compactor-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new betaclawDB(dbPath, 'micro');
  return { db, dbPath };
}

describe('Compactor', () => {
  let db: betaclawDB;
  let dbPath: string;
  let compactor: Compactor;

  beforeEach(() => {
    const tmp = makeTempDb();
    db = tmp.db;
    dbPath = tmp.dbPath;
    compactor = new Compactor(db);
  });

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(dbPath + '-wal');
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      // temp files may already be gone
    }
  });

  it('summarize produces shorter output than input', () => {
    const messages = [
      { role: 'user', content: 'We should implement the new authentication system using JWT tokens. This will need to handle refresh tokens and session management. Please confirm the approach.' },
      { role: 'assistant', content: 'I agree we should use JWT. I will implement the token refresh mechanism and build the session manager. The plan is confirmed and we can proceed with development.' },
      { role: 'user', content: 'Great. Also need to update the database schema to store user roles and permissions. This change must be backwards compatible.' },
      { role: 'assistant', content: 'I will create a migration that adds the roles table without breaking existing queries. The deployment plan is confirmed.' },
    ];

    const inputLength = messages.reduce((s, m) => s + m.content.length, 0);
    const summary = compactor.summarize(messages);
    expect(summary.length).toBeLessThan(inputLength);
    expect(summary.length).toBeGreaterThan(0);
  });

  it('summarize preserves key content', () => {
    const messages = [
      { role: 'user', content: 'We need to deploy the application to production immediately.' },
      { role: 'assistant', content: 'Confirmed. I will deploy the application now and update the configuration.' },
    ];

    const summary = compactor.summarize(messages);
    expect(summary.toLowerCase()).toMatch(/deploy|application|confirm/);
  });

  it('extractFacts returns array of strings', () => {
    const messages = [
      { role: 'user', content: 'We should fix the login bug. The user must reset their password.' },
      { role: 'assistant', content: 'I will implement the fix. We need to update the validation logic.' },
    ];

    const summary = compactor.summarize(messages);
    const facts = compactor.extractFacts(summary);

    expect(Array.isArray(facts)).toBe(true);
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(typeof fact).toBe('string');
    }
  });

  it('full compact flow: summarize → store → retrieve', () => {
    const groupId = 'group-compact-flow';
    const sessionId = 'session-compact-flow';
    const messages = [
      { role: 'user', content: 'We decided to change the API endpoint structure. This must be done before the release.' },
      { role: 'assistant', content: 'I will update all endpoints. The migration plan should handle backwards compatibility.' },
      { role: 'user', content: 'Also need to fix the caching layer. Please confirm when done.' },
      { role: 'assistant', content: 'Cache fix is implemented and confirmed. We should deploy this change next.' },
    ];

    const result = compactor.compact(groupId, sessionId, messages);

    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.messagesCompacted).toBe(4);

    const retrieved = compactor.getLatestSummary(groupId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.summary.length).toBeGreaterThan(0);
  });

  it('token reduction is measurable', () => {
    const messages = [
      { role: 'user', content: 'We should implement feature A with approach X. This will need careful planning and must be done correctly. The team confirmed the approach at the last meeting.' },
      { role: 'assistant', content: 'I will build feature A using approach X as confirmed. The implementation plan includes database changes and API updates. We need to deploy by Friday.' },
      { role: 'user', content: 'Please also update the documentation and fix the test suite. We must ensure all tests pass before release.' },
      { role: 'assistant', content: 'Documentation has been updated. All tests are now passing. I will create a release build and deploy it to staging.' },
    ];

    const result = compactor.compact('grp', 'sess-reduction', messages);
    expect(result.reductionPercent).toBeGreaterThan(0);
    expect(result.tokensBefore).toBeGreaterThan(result.tokensAfter);
  });

  it('CompactionResult has correct fields', () => {
    const result = compactor.compact('grp', 'sess-fields', [
      { role: 'user', content: 'We should update the configuration.' },
      { role: 'assistant', content: 'I will update it now. Change confirmed.' },
    ]);

    const expected: Array<keyof CompactionResult> = [
      'summary',
      'keyFacts',
      'messagesCompacted',
      'tokensBefore',
      'tokensAfter',
      'reductionPercent',
    ];

    for (const key of expected) {
      expect(result).toHaveProperty(key);
    }

    expect(typeof result.summary).toBe('string');
    expect(Array.isArray(result.keyFacts)).toBe(true);
    expect(typeof result.messagesCompacted).toBe('number');
    expect(typeof result.tokensBefore).toBe('number');
    expect(typeof result.tokensAfter).toBe('number');
    expect(typeof result.reductionPercent).toBe('number');
  });

  it('store and retrieve session summary', () => {
    const groupId = 'grp-store-retrieve';
    const sessionId = 'sess-store-retrieve';
    const summary = '@summary{ text:Test summary content }';
    const keyFacts = ['Fact one about deployment', 'Fact two about testing'];

    db.insertSession({
      id: sessionId,
      group_id: groupId,
      summary,
      key_facts: '@facts{ items:[Fact one about deployment, Fact two about testing] }',
      token_count: 42,
      started_at: Math.floor(Date.now() / 1000),
    });

    const retrieved = compactor.getLatestSummary(groupId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.summary).toBe(summary);
    expect(retrieved!.keyFacts).toHaveLength(2);
    expect(retrieved!.keyFacts[0]).toBe('Fact one about deployment');
  });

  it('empty messages produce empty summary', () => {
    const summary = compactor.summarize([]);
    expect(summary).toBe('');
  });

  it('single message compaction', () => {
    const result = compactor.compact('grp', 'sess-single', [
      { role: 'user', content: 'We should deploy the fix immediately. This must happen today.' },
    ]);

    expect(result.messagesCompacted).toBe(1);
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.tokensBefore).toBeGreaterThan(0);
  });

  it('summary stored in database', () => {
    const sessionId = 'sess-db-check';

    compactor.storeSessionSummary(
      sessionId,
      '@summary{ text:Stored summary }',
      ['fact-a', 'fact-b'],
      25,
    );

    const chunks = db.searchMemory('compaction', sessionId);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.source_type).toBe('compaction');
    expect(chunks[0]!.content).toContain('Stored summary');
  });

  it('estimateTokens uses chars / 4', () => {
    expect(compactor.estimateTokens('a'.repeat(100))).toBe(25);
    expect(compactor.estimateTokens('a'.repeat(7))).toBe(2);
    expect(compactor.estimateTokens('')).toBe(0);
  });

  it('getLatestSummary returns null when no session exists', () => {
    const result = compactor.getLatestSummary('nonexistent-group');
    expect(result).toBeNull();
  });
});
