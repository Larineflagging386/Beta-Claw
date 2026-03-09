import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelCatalog } from '../../src/core/model-catalog.js';
import { ProviderRegistry } from '../../src/core/provider-registry.js';
import { betaclawDB } from '../../src/db.js';
import type {
  IProviderAdapter,
  CompletionRequest,
  CompletionResponse,
  CompletionChunk,
  TokenCost,
  ModelCatalogResponse,
  ProviderFeature,
} from '../../src/providers/interface.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-catalog-test-'));
  return path.join(dir, 'test.db');
}

function createMockProvider(
  id: string,
  models: Array<{ id: string; name: string; inputCost: number; outputCost: number; contextWindow?: number }>,
): IProviderAdapter {
  return {
    id,
    name: `Mock ${id}`,
    baseURL: `https://${id}.api`,
    async fetchAvailableModels(): Promise<ModelCatalogResponse> {
      return {
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          contextWindow: m.contextWindow ?? 128000,
          inputCostPer1M: m.inputCost,
          outputCostPer1M: m.outputCost,
          capabilities: ['streaming', 'function_calling'],
          deprecated: false,
        })),
        fetchedAt: Math.floor(Date.now() / 1000),
        providerID: id,
      };
    },
    async complete(_req: CompletionRequest): Promise<CompletionResponse> {
      return {
        content: 'mock',
        model: 'mock',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: 'stop',
      };
    },
    async *stream(_req: CompletionRequest): AsyncIterable<CompletionChunk> {
      yield { content: 'mock', done: true };
    },
    estimateCost(_req: CompletionRequest): TokenCost {
      return { estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUSD: 0 };
    },
    supportsFeature(_f: ProviderFeature): boolean {
      return false;
    },
  };
}

describe('ModelCatalog', () => {
  let db: betaclawDB;
  let registry: ProviderRegistry;
  let catalog: ModelCatalog;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = new betaclawDB(dbPath);
    registry = new ProviderRegistry();
    catalog = new ModelCatalog(db, registry);
  });

  afterEach(() => {
    catalog.stopAutoRefresh();
    db.close();
    try { fs.unlinkSync(dbPath); } catch { /* */ }
    try { fs.unlinkSync(dbPath + '-wal'); } catch { /* */ }
    try { fs.unlinkSync(dbPath + '-shm'); } catch { /* */ }
    try { fs.rmdirSync(path.dirname(dbPath)); } catch { /* */ }
  });

  it('refreshes and stores models from a provider', async () => {
    const provider = createMockProvider('test', [
      { id: 'model-a', name: 'Model A', inputCost: 0.1, outputCost: 0.2 },
      { id: 'model-b', name: 'Model B', inputCost: 3.0, outputCost: 15.0 },
    ]);
    registry.register(provider);
    const count = await catalog.refreshProvider(provider);
    expect(count).toBe(2);
  });

  it('assigns nano tier to cheap models', async () => {
    const provider = createMockProvider('test', [
      { id: 'cheap-model', name: 'Cheap', inputCost: 0.1, outputCost: 0.2 },
    ]);
    registry.register(provider);
    await catalog.refreshProvider(provider);
    const nanoModels = catalog.getModelsByTier('nano');
    expect(nanoModels).toHaveLength(1);
    expect(nanoModels[0]!.model_id).toBe('cheap-model');
  });

  it('assigns standard tier to mid-cost models', async () => {
    const provider = createMockProvider('test', [
      { id: 'mid-model', name: 'Mid', inputCost: 1.0, outputCost: 4.0 },
    ]);
    registry.register(provider);
    await catalog.refreshProvider(provider);
    const models = catalog.getModelsByTier('standard');
    expect(models).toHaveLength(1);
  });

  it('assigns pro tier to expensive models', async () => {
    const provider = createMockProvider('test', [
      { id: 'pro-model', name: 'Pro', inputCost: 3.0, outputCost: 15.0 },
    ]);
    registry.register(provider);
    await catalog.refreshProvider(provider);
    const models = catalog.getModelsByTier('pro');
    expect(models).toHaveLength(1);
  });

  it('assigns max tier to most expensive models', async () => {
    const provider = createMockProvider('test', [
      { id: 'max-model', name: 'Max', inputCost: 15.0, outputCost: 75.0 },
    ]);
    registry.register(provider);
    await catalog.refreshProvider(provider);
    const models = catalog.getModelsByTier('max');
    expect(models).toHaveLength(1);
  });

  it('refreshes all providers', async () => {
    registry.register(
      createMockProvider('p1', [
        { id: 'm1', name: 'M1', inputCost: 0.1, outputCost: 0.2 },
      ]),
    );
    registry.register(
      createMockProvider('p2', [
        { id: 'm2', name: 'M2', inputCost: 3.0, outputCost: 15.0 },
      ]),
    );
    await catalog.refreshAll();
    const all = catalog.getAllModels();
    expect(all).toHaveLength(2);
  });

  it('finds a model by ID', async () => {
    registry.register(
      createMockProvider('test', [
        { id: 'target-model', name: 'Target', inputCost: 1.0, outputCost: 2.0 },
      ]),
    );
    await catalog.refreshAll();
    const found = catalog.findModel('target-model');
    expect(found).toBeDefined();
    expect(found!.model_name).toBe('Target');
  });

  it('returns undefined for nonexistent model', async () => {
    await catalog.refreshAll();
    expect(catalog.findModel('nonexistent')).toBeUndefined();
  });

  it('gets best model for tier sorted by capabilities then cost', async () => {
    registry.register(
      createMockProvider('test', [
        { id: 'cheap', name: 'Cheap Nano', inputCost: 0.05, outputCost: 0.1 },
        { id: 'pricier', name: 'Pricier Nano', inputCost: 0.2, outputCost: 0.3 },
      ]),
    );
    await catalog.refreshAll();
    const best = catalog.getBestModelForTier('nano');
    expect(best).toBeDefined();
    expect(best!.model_id).toBe('cheap');
  });

  it('returns undefined for empty tier', async () => {
    await catalog.refreshAll();
    expect(catalog.getBestModelForTier('max')).toBeUndefined();
  });

  it('clears old models on refresh', async () => {
    const provider = createMockProvider('test', [
      { id: 'old-model', name: 'Old', inputCost: 0.1, outputCost: 0.2 },
    ]);
    registry.register(provider);
    await catalog.refreshProvider(provider);

    const updatedProvider = createMockProvider('test', [
      { id: 'new-model', name: 'New', inputCost: 0.1, outputCost: 0.2 },
    ]);
    await catalog.refreshProvider(updatedProvider);

    const models = catalog.getModelsByProvider('test');
    expect(models).toHaveLength(1);
    expect(models[0]!.model_id).toBe('new-model');
  });

  it('does not use setInterval for auto-refresh', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/core/model-catalog.ts'),
      'utf-8',
    );
    expect(src).not.toContain('setInterval');
    expect(src).toContain('setTimeout');
  });
});
