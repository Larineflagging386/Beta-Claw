import type { MicroClawDB, ModelCatalogEntry } from '../db.js';
import type { IProviderAdapter, ModelEntry } from '../providers/interface.js';
import type { ProviderRegistry } from './provider-registry.js';
import pino from 'pino';

type ModelTier = 'nano' | 'standard' | 'pro' | 'max';

interface TierThresholds {
  nanoMaxCost: number;
  standardMaxCost: number;
  proMaxCost: number;
}

const DEFAULT_THRESHOLDS: TierThresholds = {
  nanoMaxCost: 0.5,
  standardMaxCost: 5.0,
  proMaxCost: 20.0,
};

const CATALOG_TTL_MS = 4 * 60 * 60 * 1000;

class ModelCatalog {
  private readonly db: MicroClawDB;
  private readonly registry: ProviderRegistry;
  private readonly logger: pino.Logger;
  private readonly thresholds: TierThresholds;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    db: MicroClawDB,
    registry: ProviderRegistry,
    logger?: pino.Logger,
    thresholds?: TierThresholds,
  ) {
    this.db = db;
    this.registry = registry;
    this.logger = logger ?? pino({ level: 'silent' });
    this.thresholds = thresholds ?? DEFAULT_THRESHOLDS;
  }

  async refreshAll(): Promise<void> {
    const providers = this.registry.list();
    const results = await Promise.allSettled(
      providers.map((p) => this.refreshProvider(p)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'rejected') {
        this.logger.warn(
          { providerId: providers[i]!.id, error: String(result.reason) },
          'Failed to refresh model catalog',
        );
      }
    }
  }

  async refreshProvider(provider: IProviderAdapter): Promise<number> {
    const catalog = await provider.fetchAvailableModels();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + Math.floor(CATALOG_TTL_MS / 1000);

    this.db.clearProviderModels(provider.id);

    let count = 0;
    for (const model of catalog.models) {
      if (model.deprecated) continue;

      const tier = this.assignTier(model);
      this.db.upsertModelCatalogEntry({
        provider_id: provider.id,
        model_id: model.id,
        model_name: model.name,
        context_window: model.contextWindow,
        input_cost_per_1m: model.inputCostPer1M,
        output_cost_per_1m: model.outputCostPer1M,
        capabilities: JSON.stringify(model.capabilities),
        tier,
        fetched_at: now,
        expires_at: expiresAt,
      });
      count++;
    }

    this.logger.info({ providerId: provider.id, modelCount: count }, 'Model catalog refreshed');
    return count;
  }

  getModelsByTier(tier: ModelTier): ModelCatalogEntry[] {
    return this.db.getModelsByTier(tier);
  }

  getModelsByProvider(providerId: string): ModelCatalogEntry[] {
    return this.db.getModelsByProvider(providerId);
  }

  getAllModels(): ModelCatalogEntry[] {
    const providers = this.registry.listIds();
    const all: ModelCatalogEntry[] = [];
    for (const pid of providers) {
      all.push(...this.db.getModelsByProvider(pid));
    }
    return all;
  }

  findModel(modelId: string): ModelCatalogEntry | undefined {
    const all = this.getAllModels();
    return all.find((m) => m.model_id === modelId);
  }

  getBestModelForTier(tier: ModelTier): ModelCatalogEntry | undefined {
    const models = this.getModelsByTier(tier);
    if (models.length === 0) return undefined;

    return models.sort((a, b) => {
      const capA = a.capabilities ? JSON.parse(a.capabilities).length : 0;
      const capB = b.capabilities ? JSON.parse(b.capabilities).length : 0;
      if (capA !== capB) return capB - capA;
      return (a.input_cost_per_1m ?? Infinity) - (b.input_cost_per_1m ?? Infinity);
    })[0];
  }

  startAutoRefresh(): void {
    this.stopAutoRefresh();
    const refresh = (): void => {
      void this.refreshAll().finally(() => {
        if (this.refreshTimer !== null) {
          this.refreshTimer = setTimeout(refresh, CATALOG_TTL_MS);
        }
      });
    };
    this.refreshTimer = setTimeout(refresh, CATALOG_TTL_MS);
  }

  stopAutoRefresh(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private assignTier(model: ModelEntry): ModelTier {
    const avgCost = (model.inputCostPer1M + model.outputCostPer1M) / 2;

    if (avgCost <= this.thresholds.nanoMaxCost) return 'nano';
    if (avgCost <= this.thresholds.standardMaxCost) return 'standard';
    if (avgCost <= this.thresholds.proMaxCost) return 'pro';
    return 'max';
  }
}

export { ModelCatalog, CATALOG_TTL_MS };
export type { ModelTier, TierThresholds };
