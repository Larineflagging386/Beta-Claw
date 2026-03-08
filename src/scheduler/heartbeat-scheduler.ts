import fs from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import type { MicroClawDB, HeartbeatConfig } from '../db.js';
import type { ProviderRegistry } from '../core/provider-registry.js';
import type { ModelEntry } from '../core/model-catalog.js';
import { selectModel } from '../core/model-selector.js';
import { buildSystemPrompt } from '../core/prompt-builder.js';
import { GROUPS_DIR, HEARTBEAT_FILENAME, HEARTBEAT_PROMPT_PATH } from '../core/paths.js';

interface HeartbeatDeliverFn {
  (groupId: string, content: string): Promise<void>;
}

interface HeartbeatSchedulerConfig {
  db: MicroClawDB;
  registry: ProviderRegistry;
  catalog: ModelEntry[];
  deliver: HeartbeatDeliverFn;
  logger?: pino.Logger;
}

const HEARTBEAT_OK_PATTERN = /HEARTBEAT_OK/;
const DEFAULT_ACK_MAX_CHARS = 300;

function msToMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

function msToCronExpr(ms: number): string {
  const minutes = msToMinutes(ms);
  if (minutes <= 59) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

function isHeartbeatFileEmpty(groupId: string): boolean {
  const hbPath = path.join(GROUPS_DIR, groupId, HEARTBEAT_FILENAME);
  if (!fs.existsSync(hbPath)) return true;
  const content = fs.readFileSync(hbPath, 'utf-8');
  const stripped = content.replace(/^#[^\n]*$/gm, '').replace(/\s+/g, '').trim();
  return stripped.length === 0;
}

function loadHeartbeatPrompt(): string {
  try {
    if (fs.existsSync(HEARTBEAT_PROMPT_PATH)) {
      return fs.readFileSync(HEARTBEAT_PROMPT_PATH, 'utf-8').trim();
    }
  } catch { /* fall through */ }
  return 'Read HEARTBEAT.md if it exists. Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.';
}

function isAckResponse(response: string, ackMaxChars: number): boolean {
  const trimmed = response.trim();
  if (trimmed === 'HEARTBEAT_OK') return true;
  const stripped = trimmed.replace(HEARTBEAT_OK_PATTERN, '').trim();
  return HEARTBEAT_OK_PATTERN.test(trimmed) && stripped.length <= ackMaxChars;
}

class HeartbeatScheduler {
  private readonly db: MicroClawDB;
  private readonly registry: ProviderRegistry;
  private readonly catalog: ModelEntry[];
  private readonly deliver: HeartbeatDeliverFn;
  private readonly logger: pino.Logger;
  private readonly jobs: Map<string, cron.ScheduledTask> = new Map();
  private readonly busyGroups: Set<string> = new Set();
  private running = false;

  constructor(config: HeartbeatSchedulerConfig) {
    this.db = config.db;
    this.registry = config.registry;
    this.catalog = config.catalog;
    this.deliver = config.deliver;
    this.logger = config.logger ?? pino({ level: 'silent' });
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const configs = this.db.getAllHeartbeatConfigs();
    for (const cfg of configs) {
      this.scheduleGroup(cfg);
    }
    this.logger.info({ groupCount: configs.length }, 'Heartbeat scheduler started');
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    this.logger.info('Heartbeat scheduler stopped');
  }

  refresh(): void {
    this.stop();
    this.start();
  }

  async triggerNow(groupId?: string): Promise<void> {
    if (groupId) {
      const cfg = this.db.getHeartbeatConfig(groupId);
      if (cfg) await this.tick(cfg);
      return;
    }

    const configs = this.db.getAllHeartbeatConfigs();
    for (const cfg of configs) {
      await this.tick(cfg);
    }
  }

  pauseGroup(groupId: string): void {
    this.db.setHeartbeatEnabled(groupId, false);
    const job = this.jobs.get(groupId);
    if (job) {
      job.stop();
      this.jobs.delete(groupId);
    }
    this.logger.info({ groupId }, 'Heartbeat paused');
  }

  resumeGroup(groupId: string): void {
    this.db.setHeartbeatEnabled(groupId, true);
    const cfg = this.db.getHeartbeatConfig(groupId);
    if (cfg) this.scheduleGroup(cfg);
    this.logger.info({ groupId }, 'Heartbeat resumed');
  }

  getStatus(): Array<{ groupId: string; enabled: boolean; lastTick: number | null; nextTick: number | null }> {
    const all = this.db.getAllHeartbeatConfigs();
    return all.map(c => ({
      groupId: c.group_id,
      enabled: c.enabled === 1,
      lastTick: c.last_tick,
      nextTick: c.next_tick,
    }));
  }

  private scheduleGroup(cfg: HeartbeatConfig): void {
    if (cfg.every_ms <= 0) return;
    const expr = msToCronExpr(cfg.every_ms);
    const job = cron.schedule(expr, () => void this.tick(cfg));
    this.jobs.set(cfg.group_id, job);
  }

  private async tick(cfg: HeartbeatConfig): Promise<void> {
    const now = Date.now();
    const groupId = cfg.group_id;

    // Pre-flight 1: HEARTBEAT.md empty → skip, zero API cost
    if (isHeartbeatFileEmpty(groupId)) {
      this.logTick(groupId, now, true, 'heartbeat_file_empty');
      return;
    }

    // Pre-flight 2: group busy → skip
    if (this.busyGroups.has(groupId)) {
      this.logTick(groupId, now, true, 'group_busy');
      return;
    }

    // Pre-flight 3: all delivery flags false → skip
    if (!cfg.show_ok && !cfg.show_alerts && !cfg.use_indicator) {
      this.logTick(groupId, now, true, 'all_delivery_flags_false');
      return;
    }

    this.busyGroups.add(groupId);
    try {
      // Select model (nano tier preferred for heartbeats)
      const nanoModels = this.catalog.filter(m => m.tier === 'nano');
      const sel = nanoModels.length > 0
        ? { model: nanoModels[0]!, tier: 'nano' as const }
        : selectModel(this.catalog, 'heartbeat check');
      if (!sel) {
        this.logTick(groupId, now, true, 'no_model_available');
        return;
      }

      const provider = this.registry.get(sel.model.provider_id);
      if (!provider) {
        this.logTick(groupId, now, true, 'provider_unavailable');
        return;
      }

      // Build minimal prompt (lightContext: only HEARTBEAT.md)
      const systemPrompt = await buildSystemPrompt({
        groupId,
        promptMode: 'minimal',
        lightContext: cfg.light_context === 1,
      });

      const userMessage = loadHeartbeatPrompt();

      const response = await provider.complete({
        model: sel.model.id,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 512,
        systemPrompt,
      });

      const ackMaxChars = cfg.ack_max_chars ?? DEFAULT_ACK_MAX_CHARS;
      const responseContent = response.content?.trim() ?? '';
      const tokensUsed = response.usage?.totalTokens ?? 0;

      // Update tick timestamp
      this.db.updateHeartbeatTick(groupId, Math.floor(now / 1000), null);

      if (isAckResponse(responseContent, ackMaxChars)) {
        // HEARTBEAT_OK — no delivery
        this.logTick(groupId, now, false, undefined, 'ok', tokensUsed);
        if (cfg.show_ok) {
          await this.routeDelivery(cfg, groupId, responseContent);
        }
        return;
      }

      // Real content — deliver
      this.logTick(groupId, now, false, undefined, 'alert', tokensUsed);
      if (cfg.show_alerts) {
        await this.routeDelivery(cfg, groupId, responseContent);
      }
    } catch (err) {
      this.logger.error({ groupId, err }, 'Heartbeat tick error');
      this.logTick(groupId, now, false, undefined, 'error');
    } finally {
      this.busyGroups.delete(groupId);
    }
  }

  private async routeDelivery(cfg: HeartbeatConfig, groupId: string, content: string): Promise<void> {
    const target = cfg.target ?? 'none';
    if (target === 'none') return;
    await this.deliver(groupId, content);
  }

  private logTick(
    groupId: string,
    tickAt: number,
    skipped: boolean,
    skipReason?: string,
    responseType?: string,
    tokensUsed?: number,
  ): void {
    this.db.insertHeartbeatLog({
      id: randomUUID(),
      group_id: groupId,
      tick_at: Math.floor(tickAt / 1000),
      skipped: skipped ? 1 : 0,
      skip_reason: skipReason ?? null,
      response_type: responseType ?? null,
      tokens_used: tokensUsed ?? null,
      cost_usd: null,
    });
    this.logger.info({ groupId, skipped, skipReason, responseType }, 'Heartbeat tick');
  }
}

export { HeartbeatScheduler };
export type { HeartbeatSchedulerConfig, HeartbeatDeliverFn };
