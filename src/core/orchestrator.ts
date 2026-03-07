import { EventEmitter } from 'node:events';
import { MicroClawDB } from '../db.js';
import type { ResourceProfile } from '../db.js';
import type { IChannel, InboundMessage } from '../channels/interface.js';
import type { IProviderAdapter } from '../providers/interface.js';
import pino from 'pino';

interface OrchestratorEvent {
  type: 'message' | 'scheduled_task' | 'webhook' | 'ipc' | 'skill_reload' | 'shutdown';
  groupId?: string;
  payload: unknown;
  timestamp: number;
}

interface OrchestratorConfig {
  dbPath: string;
  profile: ResourceProfile;
  maxConcurrentGroups: number;
  logLevel: pino.Level;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  dbPath: 'microclaw.db',
  profile: 'standard',
  maxConcurrentGroups: 3,
  logLevel: 'info',
};

class Orchestrator extends EventEmitter {
  private readonly db: MicroClawDB;
  private readonly config: OrchestratorConfig;
  private readonly logger: pino.Logger;
  private readonly channels: Map<string, IChannel> = new Map();
  private readonly providers: Map<string, IProviderAdapter> = new Map();
  private activeGroups = 0;
  private running = false;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = pino({ level: this.config.logLevel });
    this.db = new MicroClawDB(this.config.dbPath, this.config.profile);

    this.on('event', (event: OrchestratorEvent) => {
      void this.handleEvent(event);
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger.info({ profile: this.config.profile }, 'Orchestrator starting');

    for (const [, channel] of this.channels) {
      await channel.connect();
    }

    this.processPendingIpc();
    this.logger.info('Orchestrator started — purely event-driven');
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.logger.info('Orchestrator shutting down');

    for (const [, channel] of this.channels) {
      await channel.disconnect();
    }

    this.db.close();
    this.emit('event', {
      type: 'shutdown',
      payload: null,
      timestamp: Date.now(),
    } satisfies OrchestratorEvent);
    this.removeAllListeners();
    this.logger.info('Orchestrator stopped');
  }

  registerChannel(channel: IChannel): void {
    this.channels.set(channel.id, channel);
    channel.onMessage((msg: InboundMessage) => {
      this.emit('event', {
        type: 'message',
        groupId: msg.groupId,
        payload: msg,
        timestamp: Date.now(),
      } satisfies OrchestratorEvent);
    });
    this.logger.info({ channelId: channel.id }, 'Channel registered');
  }

  registerProvider(provider: IProviderAdapter): void {
    this.providers.set(provider.id, provider);
    this.logger.info({ providerId: provider.id }, 'Provider registered');
  }

  getProvider(id: string): IProviderAdapter | undefined {
    return this.providers.get(id);
  }

  getChannel(id: string): IChannel | undefined {
    return this.channels.get(id);
  }

  getDB(): MicroClawDB {
    return this.db;
  }

  isRunning(): boolean {
    return this.running;
  }

  private async handleEvent(event: OrchestratorEvent): Promise<void> {
    if (!this.running && event.type !== 'shutdown') return;

    switch (event.type) {
      case 'message':
        await this.handleMessage(event);
        break;
      case 'scheduled_task':
        await this.handleScheduledTask(event);
        break;
      case 'webhook':
        await this.handleWebhook(event);
        break;
      case 'ipc':
        await this.handleIpc(event);
        break;
      case 'skill_reload':
        this.logger.info('Skills reloaded');
        break;
      case 'shutdown':
        this.logger.info('Shutdown event received');
        break;
    }
  }

  private async handleMessage(event: OrchestratorEvent): Promise<void> {
    if (this.activeGroups >= this.config.maxConcurrentGroups) {
      this.logger.warn({ groupId: event.groupId }, 'Max concurrent groups reached, queuing');
      return;
    }

    this.activeGroups++;
    try {
      const msg = event.payload as InboundMessage;
      this.logger.info({ groupId: msg.groupId, senderId: msg.senderId }, 'Processing message');

      this.db.insertMessage({
        id: msg.id,
        group_id: msg.groupId,
        sender_id: msg.senderId,
        content: msg.content,
        timestamp: msg.timestamp,
        channel: this.getChannelForGroup(msg.groupId),
        reply_to_id: msg.replyToId ?? null,
        processed: 0,
        error: null,
        content_redacted: null,
      });

      this.db.updateGroupLastActive(msg.groupId);

      // Placeholder: in later phases, this routes to the planner agent
      // via DAG execution. For now, just mark as processed.
      this.db.markMessageProcessed(msg.id);
    } catch (err) {
      this.logger.error({ err, groupId: event.groupId }, 'Error processing message');
    } finally {
      this.activeGroups--;
    }
  }

  private async handleScheduledTask(_event: OrchestratorEvent): Promise<void> {
    this.logger.info('Scheduled task handling (placeholder)');
  }

  private async handleWebhook(_event: OrchestratorEvent): Promise<void> {
    this.logger.info('Webhook handling (placeholder)');
  }

  private async handleIpc(_event: OrchestratorEvent): Promise<void> {
    this.logger.info('IPC handling (placeholder)');
  }

  private processPendingIpc(): void {
    const pending = this.db.getUnprocessedIpcMessages();
    for (const msg of pending) {
      this.emit('event', {
        type: 'ipc',
        payload: msg,
        timestamp: Date.now(),
      } satisfies OrchestratorEvent);
      this.db.markIpcProcessed(msg.id);
    }
  }

  private getChannelForGroup(groupId: string): string {
    const group = this.db.getGroup(groupId);
    return group?.channel ?? 'cli';
  }
}

export { Orchestrator };
export type { OrchestratorEvent, OrchestratorConfig };
