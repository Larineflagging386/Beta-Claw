import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { betaclawDB } from '../src/db.js';
import type {
  Message,
  Session,
  ToolCacheEntry,
  ScheduledTask,
  Group,
  ModelCatalogEntry,
  SecurityEvent,
  IpcMessage,
  Snapshot,
} from '../src/db.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betaclaw-test-'));
  return path.join(dir, 'test.db');
}

describe('betaclawDB', () => {
  let db: betaclawDB;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = new betaclawDB(dbPath);
  });

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(dbPath + '-wal');
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      // Files may not exist
    }
    try {
      fs.rmdirSync(path.dirname(dbPath));
    } catch {
      // Dir may not be empty
    }
  });

  describe('initialization', () => {
    it('creates database with WAL mode', () => {
      const mode = db.db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    });

    it('creates all tables', () => {
      const tables = db.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'memory_fts%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('messages');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('tool_cache');
      expect(tableNames).toContain('scheduled_tasks');
      expect(tableNames).toContain('groups');
      expect(tableNames).toContain('model_catalog');
      expect(tableNames).toContain('security_events');
      expect(tableNames).toContain('ipc_messages');
      expect(tableNames).toContain('snapshots');
    });

    it('creates FTS5 virtual table', () => {
      const tables = db.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'memory_fts'")
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it('creates indexes', () => {
      const indexes = db.db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_messages_group_ts');
      expect(indexNames).toContain('idx_sessions_group');
      expect(indexNames).toContain('idx_tool_cache_lookup');
    });

    it('respects resource profile cache sizes', () => {
      db.close();
      const microDb = new betaclawDB(dbPath, 'micro');
      const cacheSize = microDb.db.pragma('cache_size', { simple: true });
      expect(cacheSize).toBe(-2000);
      microDb.close();
    });
  });

  describe('messages', () => {
    const msg: Message = {
      id: 'msg_001',
      group_id: 'grp_001',
      sender_id: 'user_001',
      content: 'Hello world',
      timestamp: Math.floor(Date.now() / 1000),
      channel: 'whatsapp',
      processed: 0,
    };

    it('inserts and retrieves messages', () => {
      db.insertMessage(msg);
      const messages = db.getMessagesByGroup('grp_001');
      expect(messages).toHaveLength(1);
      expect(messages[0]!.id).toBe('msg_001');
      expect(messages[0]!.content).toBe('Hello world');
    });

    it('retrieves unprocessed messages', () => {
      db.insertMessage(msg);
      db.insertMessage({ ...msg, id: 'msg_002', processed: 1, timestamp: msg.timestamp + 1 });
      const unprocessed = db.getUnprocessedMessages('grp_001');
      expect(unprocessed).toHaveLength(1);
      expect(unprocessed[0]!.id).toBe('msg_001');
    });

    it('marks messages as processed', () => {
      db.insertMessage(msg);
      db.markMessageProcessed('msg_001');
      const unprocessed = db.getUnprocessedMessages('grp_001');
      expect(unprocessed).toHaveLength(0);
    });

    it('marks messages as processed with error', () => {
      db.insertMessage(msg);
      db.markMessageProcessed('msg_001', 'Provider timeout');
      const messages = db.getMessagesByGroup('grp_001');
      expect(messages[0]!.error).toBe('Provider timeout');
    });

    it('stores redacted content', () => {
      db.insertMessage({ ...msg, content_redacted: 'Hello [REDACTED:EMAIL]' });
      const messages = db.getMessagesByGroup('grp_001');
      expect(messages[0]!.content_redacted).toBe('Hello [REDACTED:EMAIL]');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        db.insertMessage({ ...msg, id: `msg_${i}`, timestamp: msg.timestamp + i });
      }
      const messages = db.getMessagesByGroup('grp_001', 3);
      expect(messages).toHaveLength(3);
    });

    it('rejects invalid message with Zod', () => {
      expect(() =>
        db.insertMessage({ id: 'x', group_id: 'g', sender_id: 's' } as Message),
      ).toThrow();
    });
  });

  describe('sessions', () => {
    const session: Session = {
      id: 'sess_001',
      group_id: 'grp_001',
      started_at: Math.floor(Date.now() / 1000),
    };

    it('inserts and retrieves sessions', () => {
      db.insertSession(session);
      const latest = db.getLatestSession('grp_001');
      expect(latest).toBeDefined();
      expect(latest!.id).toBe('sess_001');
    });

    it('ends a session with summary', () => {
      db.insertSession(session);
      db.endSession('sess_001', 'User greeted', '@facts{mood:happy}', 150);
      const latest = db.getLatestSession('grp_001');
      expect(latest!.summary).toBe('User greeted');
      expect(latest!.key_facts).toBe('@facts{mood:happy}');
      expect(latest!.token_count).toBe(150);
      expect(latest!.ended_at).toBeTypeOf('number');
    });

    it('returns latest session by started_at', () => {
      db.insertSession(session);
      db.insertSession({
        ...session,
        id: 'sess_002',
        started_at: session.started_at + 100,
      });
      const latest = db.getLatestSession('grp_001');
      expect(latest!.id).toBe('sess_002');
    });

    it('returns undefined for nonexistent group', () => {
      const latest = db.getLatestSession('nonexistent');
      expect(latest).toBeUndefined();
    });
  });

  describe('tool cache', () => {
    const now = Math.floor(Date.now() / 1000);
    const entry: ToolCacheEntry = {
      id: 'tc_001',
      tool_name: 'brave_search',
      input_hash: 'abc123',
      result: '@result{data:found}',
      created_at: now,
      expires_at: now + 3600,
      hit_count: 0,
    };

    it('inserts and retrieves cached results', () => {
      db.insertToolCacheEntry(entry);
      const cached = db.getCachedToolResult('brave_search', 'abc123');
      expect(cached).toBeDefined();
      expect(cached!.result).toBe('@result{data:found}');
    });

    it('increments hit count on retrieval', () => {
      db.insertToolCacheEntry(entry);
      db.getCachedToolResult('brave_search', 'abc123');
      db.getCachedToolResult('brave_search', 'abc123');
      const row = db.db.prepare('SELECT hit_count FROM tool_cache WHERE id = ?').get('tc_001') as {
        hit_count: number;
      };
      expect(row.hit_count).toBe(2);
    });

    it('does not return expired entries', () => {
      db.insertToolCacheEntry({ ...entry, expires_at: now - 1 });
      const cached = db.getCachedToolResult('brave_search', 'abc123');
      expect(cached).toBeUndefined();
    });

    it('clears expired cache entries', () => {
      db.insertToolCacheEntry({ ...entry, expires_at: now - 1 });
      db.insertToolCacheEntry({
        ...entry,
        id: 'tc_002',
        input_hash: 'def456',
        expires_at: now + 3600,
      });
      const deleted = db.clearExpiredCache();
      expect(deleted).toBe(1);
    });
  });

  describe('scheduled tasks', () => {
    const task: ScheduledTask = {
      id: 'task_001',
      group_id: 'grp_001',
      name: 'Morning briefing',
      cron: '0 8 * * 1-5',
      instruction: 'Summarize AI news',
      enabled: 1,
    };

    it('inserts and retrieves enabled tasks', () => {
      db.insertScheduledTask(task);
      const tasks = db.getEnabledTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]!.name).toBe('Morning briefing');
    });

    it('does not return disabled tasks', () => {
      db.insertScheduledTask({ ...task, enabled: 0 });
      const tasks = db.getEnabledTasks();
      expect(tasks).toHaveLength(0);
    });

    it('updates last_run and next_run', () => {
      db.insertScheduledTask(task);
      const now = Math.floor(Date.now() / 1000);
      db.updateTaskLastRun('task_001', now, now + 86400);
      const tasks = db.getEnabledTasks();
      expect(tasks[0]!.last_run).toBe(now);
      expect(tasks[0]!.next_run).toBe(now + 86400);
    });
  });

  describe('groups', () => {
    const group: Group = {
      id: 'grp_001',
      channel: 'whatsapp',
      name: 'Test Group',
      trigger_word: '@rem',
      execution_mode: 'isolated',
    };

    it('inserts and retrieves groups', () => {
      db.insertGroup(group);
      const retrieved = db.getGroup('grp_001');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test Group');
      expect(retrieved!.trigger_word).toBe('@rem');
    });

    it('lists all groups', () => {
      db.insertGroup(group);
      db.insertGroup({ ...group, id: 'grp_002', name: 'Group 2' });
      const groups = db.getAllGroups();
      expect(groups).toHaveLength(2);
    });

    it('updates last_active timestamp', () => {
      db.insertGroup(group);
      db.updateGroupLastActive('grp_001');
      const retrieved = db.getGroup('grp_001');
      expect(retrieved!.last_active).toBeTypeOf('number');
    });

    it('upserts on conflict', () => {
      db.insertGroup(group);
      db.insertGroup({ ...group, name: 'Updated Name' });
      const retrieved = db.getGroup('grp_001');
      expect(retrieved!.name).toBe('Updated Name');
    });
  });

  describe('model catalog', () => {
    const now = Math.floor(Date.now() / 1000);
    const entry: ModelCatalogEntry = {
      provider_id: 'openrouter',
      model_id: 'anthropic/claude-sonnet',
      model_name: 'Claude Sonnet',
      context_window: 200000,
      input_cost_per_1m: 3.0,
      output_cost_per_1m: 15.0,
      capabilities: '["streaming","function_calling"]',
      tier: 'pro',
      fetched_at: now,
      expires_at: now + 14400,
    };

    it('upserts and retrieves model catalog entries', () => {
      db.upsertModelCatalogEntry(entry);
      const models = db.getModelsByProvider('openrouter');
      expect(models).toHaveLength(1);
      expect(models[0]!.model_name).toBe('Claude Sonnet');
    });

    it('retrieves models by tier', () => {
      db.upsertModelCatalogEntry(entry);
      db.upsertModelCatalogEntry({
        ...entry,
        model_id: 'openai/gpt-4o',
        model_name: 'GPT-4o',
      });
      const proModels = db.getModelsByTier('pro');
      expect(proModels).toHaveLength(2);
    });

    it('does not return expired models', () => {
      db.upsertModelCatalogEntry({ ...entry, expires_at: now - 1 });
      const models = db.getModelsByProvider('openrouter');
      expect(models).toHaveLength(0);
    });

    it('clears provider models', () => {
      db.upsertModelCatalogEntry(entry);
      db.clearProviderModels('openrouter');
      const models = db.getModelsByProvider('openrouter');
      expect(models).toHaveLength(0);
    });

    it('upserts on primary key conflict', () => {
      db.upsertModelCatalogEntry(entry);
      db.upsertModelCatalogEntry({ ...entry, model_name: 'Claude Sonnet Updated' });
      const models = db.getModelsByProvider('openrouter');
      expect(models).toHaveLength(1);
      expect(models[0]!.model_name).toBe('Claude Sonnet Updated');
    });
  });

  describe('security events', () => {
    const event: SecurityEvent = {
      id: 'sec_001',
      event_type: 'injection_attempt',
      group_id: 'grp_001',
      severity: 'high',
      details: '@event{pattern:ignore previous instructions}',
      blocked: 1,
    };

    it('inserts and retrieves security events', () => {
      db.insertSecurityEvent(event);
      const events = db.getSecurityEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.event_type).toBe('injection_attempt');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        db.insertSecurityEvent({ ...event, id: `sec_${i}` });
      }
      const events = db.getSecurityEvents(3);
      expect(events).toHaveLength(3);
    });
  });

  describe('IPC messages', () => {
    const ipcMsg: IpcMessage = {
      id: 'ipc_001',
      type: 'task_result',
      payload: '@result{status:ok}',
      processed: 0,
    };

    it('inserts and retrieves unprocessed IPC messages', () => {
      db.insertIpcMessage(ipcMsg);
      const messages = db.getUnprocessedIpcMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]!.type).toBe('task_result');
    });

    it('marks IPC messages as processed', () => {
      db.insertIpcMessage(ipcMsg);
      db.markIpcProcessed('ipc_001');
      const messages = db.getUnprocessedIpcMessages();
      expect(messages).toHaveLength(0);
    });

    it('ignores duplicate IPC messages (idempotency)', () => {
      db.insertIpcMessage(ipcMsg);
      db.insertIpcMessage(ipcMsg);
      const all = db.db.prepare('SELECT * FROM ipc_messages').all();
      expect(all).toHaveLength(1);
    });
  });

  describe('snapshots', () => {
    const now = Math.floor(Date.now() / 1000);
    const snapshot: Snapshot = {
      id: 'snap_001',
      description: 'Before config change',
      paths: '["config.json","settings.json"]',
      storage_dir: '.beta/snapshots/snap_001',
      expires_at: now + 604800,
    };

    it('inserts and retrieves snapshots', () => {
      db.insertSnapshot(snapshot);
      const snapshots = db.getSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]!.description).toBe('Before config change');
    });

    it('deletes a snapshot', () => {
      db.insertSnapshot(snapshot);
      db.deleteSnapshot('snap_001');
      const snapshots = db.getSnapshots();
      expect(snapshots).toHaveLength(0);
    });

    it('prunes old snapshots keeping only retainCount', () => {
      for (let i = 0; i < 5; i++) {
        db.insertSnapshot({ ...snapshot, id: `snap_${i}` });
      }
      const pruned = db.pruneOldSnapshots(3);
      expect(pruned).toBe(2);
      const remaining = db.getSnapshots();
      expect(remaining).toHaveLength(3);
    });
  });

  describe('memory FTS', () => {
    it('inserts and searches memory chunks', () => {
      db.insertMemoryChunk('chunk_001', 'The user prefers dark mode', 'grp_001', 'episodic');
      db.insertMemoryChunk(
        'chunk_002',
        'Weather forecast for tomorrow',
        'grp_001',
        'session_summary',
      );
      const results = db.searchMemory('dark mode', 'grp_001');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.content).toContain('dark mode');
    });

    it('filters by group_id', () => {
      db.insertMemoryChunk('chunk_001', 'Important fact', 'grp_001', 'episodic');
      db.insertMemoryChunk('chunk_002', 'Important fact', 'grp_002', 'episodic');
      const results = db.searchMemory('important', 'grp_001');
      expect(results.every((r) => r.group_id === 'grp_001')).toBe(true);
    });

    it('searches across all groups when groupId is omitted', () => {
      db.insertMemoryChunk('chunk_001', 'Shared knowledge', 'grp_001', 'workspace');
      db.insertMemoryChunk('chunk_002', 'Shared knowledge extra', 'grp_002', 'workspace');
      const results = db.searchMemory('shared knowledge');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('transactions', () => {
    it('commits successful transactions', () => {
      db.transaction(() => {
        db.insertGroup({
          id: 'grp_tx',
          channel: 'cli',
          trigger_word: '@rem',
          execution_mode: 'isolated',
        });
        db.insertMessage({
          id: 'msg_tx',
          group_id: 'grp_tx',
          sender_id: 'user_1',
          content: 'Hello',
          timestamp: Math.floor(Date.now() / 1000),
          channel: 'cli',
          processed: 0,
        });
      });
      expect(db.getGroup('grp_tx')).toBeDefined();
      expect(db.getMessagesByGroup('grp_tx')).toHaveLength(1);
    });

    it('rolls back failed transactions', () => {
      try {
        db.transaction(() => {
          db.insertGroup({
            id: 'grp_fail',
            channel: 'cli',
            trigger_word: '@rem',
            execution_mode: 'isolated',
          });
          throw new Error('Simulated failure');
        });
      } catch {
        // Expected
      }
      expect(db.getGroup('grp_fail')).toBeUndefined();
    });
  });
});
