import { EventEmitter } from 'node:events';
import cron from 'node-cron';
import type { betaclawDB, ScheduledTask } from '../db.js';
import type { ProviderRegistry } from '../core/provider-registry.js';
import type { ModelEntry } from '../core/model-catalog.js';
import { agentLoop } from '../core/agent-loop.js';
import { buildSystemPrompt } from '../core/prompt-builder.js';
import { selectModel } from '../core/model-selector.js';
import { DEFAULT_SANDBOX_CONFIG, type SandboxRunOptions } from '../execution/sandbox.js';
/** @deprecated WhatsAppSendFn has been removed; kept for backward compat with TaskScheduler constructor */
type WhatsAppSendFn = (to: string, message: string) => Promise<void>;

export interface TaskFiredEvent {
  taskId: string;
  groupId: string;
  instruction: string;
  scheduledTime: Date;
}

const MIN_INTERVAL_SEC = 10;

export class TaskScheduler extends EventEmitter {
  private jobs = new Map<string, cron.ScheduledTask>();
  private running = new Set<string>();

  constructor(
    private db: betaclawDB,
    private registry?: ProviderRegistry,
    private catalog?: ModelEntry[],
    _whatsappSend?: WhatsAppSendFn,
    private onMessage?: (groupId: string, text: string) => Promise<void>,
  ) {
    super();
  }

  start(): void {
    const tasks = this.db.getEnabledTasks();
    for (const task of tasks) {
      if (task.enabled) this.schedule(task);
    }
    console.log(`[cron] ${tasks.filter(t => t.enabled).length} tasks scheduled`);
  }

  stop(): void {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
    this.running.clear();
  }

  schedule(task: ScheduledTask): void {
    this.unschedule(task.id);
    if (!cron.validate(task.cron)) {
      console.warn(`[cron] Invalid cron expression for task ${task.id}: ${task.cron}`);
      return;
    }
    const job = cron.schedule(task.cron, () => {
      void this.runTask(task);
    });

    this.jobs.set(task.id, job);
  }

  addTask(config: { id: string; groupId: string; name: string; cron: string; instruction: string }): void {
    this.db.insertScheduledTask({
      id: config.id,
      group_id: config.groupId,
      name: config.name,
      cron: config.cron,
      instruction: config.instruction,
      enabled: 1,
      last_run: null,
      next_run: null,
    });
    const task = this.db.getEnabledTasks().find(t => t.id === config.id);
    if (task) this.schedule(task);
  }

  private async runTask(task: ScheduledTask): Promise<void> {
    if (!this.jobs.has(task.id)) return;

    const fresh = this.db.getEnabledTasks().find(t => t.id === task.id);
    if (!fresh) {
      console.log(`[cron] Task ${task.id} no longer in DB — skipping and unscheduling`);
      this.unschedule(task.id);
      return;
    }

    if (this.running.has(task.id)) {
      console.log(`[cron] Task ${task.id} still running from previous tick — skipping`);
      return;
    }

    this.running.add(task.id);
    console.log(`[cron] Running task: ${task.name} (${task.id})`);

    this.emit('task:fired', {
      taskId: task.id,
      groupId: task.group_id,
      instruction: task.instruction,
      scheduledTime: new Date(),
    } satisfies TaskFiredEvent);

    if (!this.registry || !this.catalog) {
      console.warn(`[cron] Task ${task.id} skipped — no registry/catalog`);
      this.running.delete(task.id);
      return;
    }

    if (!this.onMessage) {
      console.warn(`[cron] Task ${task.id} has no delivery channel — onMessage not configured`);
      this.running.delete(task.id);
      return;
    }

    let response: string | null = null;

    try {
      const sel = selectModel(this.catalog, task.instruction);
      if (!sel) { console.warn('[cron] No model available'); this.running.delete(task.id); return; }

      const provider = this.registry.get(sel.model.provider_id);
      if (!provider) { console.warn(`[cron] Provider ${sel.model.provider_id} not found`); this.running.delete(task.id); return; }

      const senderJid = task.group_id.includes('@') ? task.group_id : undefined;
      const systemPrompt = await buildSystemPrompt(task.group_id, undefined, {
        senderId: senderJid,
        channel: 'whatsapp',
      });
      const schedulerSandboxOpts: SandboxRunOptions = {
        sessionKey: `cron-${task.id}`, agentId: 'cron', isMain: false,
        elevated: 'off', groupId: task.group_id, cfg: DEFAULT_SANDBOX_CONFIG,
      };
      response = await agentLoop(
        [{ role: 'user', content: `[SCHEDULED TASK: ${task.name}]\n${task.instruction}` }],
        { provider, model: sel.model, systemPrompt, db: this.db, groupId: task.group_id, sandboxOpts: schedulerSandboxOpts },
      );
    } catch (e) {
      console.error(`[cron] Task ${task.id} agentLoop failed:`, e);
      this.running.delete(task.id);
      return;
    }

    this.running.delete(task.id);

    if (!this.jobs.has(task.id)) {
      console.log(`[cron] Task ${task.id} was removed while running — discarding response`);
      return;
    }

    if (!response) {
      console.warn(`[cron] Task ${task.id} produced empty response — not delivering`);
      return;
    }

    try {
      await this.onMessage(task.group_id, response);
      this.db.updateTaskLastRunOnly(task.id, Date.now());
      console.log(`[cron] Task ${task.id} delivered to ${task.group_id}`);
    } catch (e) {
      console.error(`[cron] Task ${task.id} delivery to ${task.group_id} failed:`, e);
    }
  }

  unschedule(id: string): void {
    this.jobs.get(id)?.stop();
    this.jobs.delete(id);
    this.running.delete(id);
  }

  refresh(): void {
    const tasks = this.db.getEnabledTasks();
    const dbIds = new Set(tasks.map(t => t.id));

    for (const id of this.jobs.keys()) {
      if (!dbIds.has(id)) {
        console.log(`[cron] Unscheduling removed task ${id}`);
        this.unschedule(id);
      }
    }

    for (const task of tasks) {
      if (!this.jobs.has(task.id)) {
        this.schedule(task);
      }
    }
  }

  static validateMinInterval(cronExpr: string): boolean {
    if (!cron.validate(cronExpr)) return false;
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 6) return true;
    const secField = parts[0]!;
    if (secField.startsWith('*/')) {
      const interval = parseInt(secField.slice(2), 10);
      if (!isNaN(interval) && interval < MIN_INTERVAL_SEC) return false;
    }
    if (secField.includes(',')) {
      const vals = secField.split(',').map(v => parseInt(v, 10)).filter(v => !isNaN(v)).sort((a, b) => a - b);
      for (let i = 1; i < vals.length; i++) {
        if (vals[i]! - vals[i - 1]! < MIN_INTERVAL_SEC) return false;
      }
    }
    return true;
  }
}
