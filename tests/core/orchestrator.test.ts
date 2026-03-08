import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Orchestrator } from '../../src/core/orchestrator.js';
import type { OrchestratorEvent } from '../../src/core/orchestrator.js';
import type { IChannel, InboundMessage, OutboundMessage } from '../../src/channels/interface.js';
import type { ChannelFeature } from '../../src/channels/interface.js';
import type { IProviderAdapter, CompletionRequest, CompletionResponse, CompletionChunk, TokenCost, ModelCatalogResponse } from '../../src/providers/interface.js';
import type { ProviderFeature } from '../../src/providers/interface.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-orch-test-'));
  return path.join(dir, 'test.db');
}

class MockChannel implements IChannel {
  id = 'mock-channel';
  name = 'Mock Channel';
  connected = false;
  sentMessages: OutboundMessage[] = [];
  private handler: ((msg: InboundMessage) => void) | null = null;

  async connect(): Promise<void> { this.connected = true; }
  async disconnect(): Promise<void> { this.connected = false; }
  async send(msg: OutboundMessage): Promise<void> { this.sentMessages.push(msg); }
  onMessage(handler: (msg: InboundMessage) => void): void { this.handler = handler; }
  supportsFeature(_f: ChannelFeature): boolean { return false; }

  simulateMessage(msg: InboundMessage): void {
    this.handler?.(msg);
  }
}

class MockProvider implements IProviderAdapter {
  id = 'mock-provider';
  name = 'Mock Provider';
  baseURL = 'https://mock.api';

  async fetchAvailableModels(): Promise<ModelCatalogResponse> {
    return { models: [], fetchedAt: Date.now(), providerID: this.id };
  }

  async complete(_req: CompletionRequest): Promise<CompletionResponse> {
    return {
      content: 'Mock response',
      model: 'mock-model',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      finishReason: 'stop',
    };
  }

  async *stream(_req: CompletionRequest): AsyncIterable<CompletionChunk> {
    yield { content: 'Mock', done: false };
    yield { content: ' response', done: true };
  }

  estimateCost(_req: CompletionRequest): TokenCost {
    return { estimatedInputTokens: 10, estimatedOutputTokens: 5, estimatedCostUSD: 0.001 };
  }

  supportsFeature(_feature: ProviderFeature): boolean { return true; }
}

describe('Orchestrator', () => {
  let orchestrator: Orchestrator;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDbPath();
    orchestrator = new Orchestrator({ dbPath, logLevel: 'silent' });
  });

  afterEach(async () => {
    if (orchestrator.isRunning()) {
      await orchestrator.stop();
    }
    try { fs.unlinkSync(dbPath); } catch { /* */ }
    try { fs.unlinkSync(dbPath + '-wal'); } catch { /* */ }
    try { fs.unlinkSync(dbPath + '-shm'); } catch { /* */ }
    try { fs.rmdirSync(path.dirname(dbPath)); } catch { /* */ }
  });

  it('starts and stops cleanly', async () => {
    await orchestrator.start();
    expect(orchestrator.isRunning()).toBe(true);
    await orchestrator.stop();
    expect(orchestrator.isRunning()).toBe(false);
  });

  it('does not start twice', async () => {
    await orchestrator.start();
    await orchestrator.start();
    expect(orchestrator.isRunning()).toBe(true);
  });

  it('registers and retrieves channels', () => {
    const channel = new MockChannel();
    orchestrator.registerChannel(channel);
    expect(orchestrator.getChannel('mock-channel')).toBe(channel);
  });

  it('registers and retrieves providers', () => {
    const provider = new MockProvider();
    orchestrator.registerProvider(provider);
    expect(orchestrator.getProvider('mock-provider')).toBe(provider);
  });

  it('connects channels on start', async () => {
    const channel = new MockChannel();
    orchestrator.registerChannel(channel);
    await orchestrator.start();
    expect(channel.connected).toBe(true);
  });

  it('disconnects channels on stop', async () => {
    const channel = new MockChannel();
    orchestrator.registerChannel(channel);
    await orchestrator.start();
    await orchestrator.stop();
    expect(channel.connected).toBe(false);
  });

  it('processes inbound messages via event emitter', async () => {
    const channel = new MockChannel();
    orchestrator.registerChannel(channel);
    await orchestrator.start();

    const db = orchestrator.getDB();
    db.insertGroup({
      id: 'grp_test',
      channel: 'mock-channel',
      trigger_word: '@rem',
      execution_mode: 'isolated',
    });

    const receivedEvents: OrchestratorEvent[] = [];
    orchestrator.on('event', (event: OrchestratorEvent) => {
      receivedEvents.push(event);
    });

    channel.simulateMessage({
      id: 'msg_001',
      groupId: 'grp_test',
      senderId: 'user_001',
      content: 'Hello MicroClaw',
      timestamp: Math.floor(Date.now() / 1000),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedEvents.length).toBeGreaterThan(0);
    const msgEvent = receivedEvents.find((e) => e.type === 'message');
    expect(msgEvent).toBeDefined();
    expect(msgEvent!.groupId).toBe('grp_test');
  });

  it('stores messages in database on receive', async () => {
    const channel = new MockChannel();
    orchestrator.registerChannel(channel);
    await orchestrator.start();

    channel.simulateMessage({
      id: 'msg_db_001',
      groupId: 'grp_db_test',
      senderId: 'user_001',
      content: 'Test message',
      timestamp: Math.floor(Date.now() / 1000),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const messages = orchestrator.getDB().getMessagesByGroup('grp_db_test');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe('Test message');
    expect(messages[0]!.processed).toBe(1);
  });

  it('is purely event-driven — no setInterval or polling', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/core/orchestrator.ts'),
      'utf-8',
    );
    expect(src).not.toContain('setInterval');
    expect(src).not.toContain('polling');
  });

  it('uses EventEmitter for event dispatch', () => {
    expect(orchestrator).toBeInstanceOf(require('node:events').EventEmitter);
  });

  it('returns undefined for unregistered provider', () => {
    expect(orchestrator.getProvider('nonexistent')).toBeUndefined();
  });

  it('returns undefined for unregistered channel', () => {
    expect(orchestrator.getChannel('nonexistent')).toBeUndefined();
  });
});
