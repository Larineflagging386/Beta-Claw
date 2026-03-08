import { randomUUID } from 'node:crypto';
import type { InboundMessage } from '../channels/interface.js';
import type { IChannel } from '../channels/interface.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueueMode = 'collect' | 'followup' | 'steer' | 'interrupt';
export type DropPolicy = 'old' | 'new' | 'summarize';

export interface QueueConfig {
  /** How new messages are handled when a run is active. Default: 'collect' */
  mode: QueueMode;
  /** Milliseconds to wait for quiet before starting a followup run. Default: 1000 */
  debounceMs: number;
  /** Max messages queued per lane before overflow policy applies. Default: 20 */
  cap: number;
  /** What to do when cap is exceeded. Default: 'summarize' */
  drop: DropPolicy;
  /** Max concurrent active runs per lane. Default: 1 */
  maxConcurrent: number;
}

export interface LaneEntry {
  id: string;
  laneId: string;
  msg: InboundMessage;
  channel: IChannel;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

export type MessageHandler = (entry: LaneEntry) => Promise<void>;

export interface QueueStats {
  lanes: number;
  queued: number;
  active: number;
  failed: number;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: QueueConfig = {
  mode: 'collect',
  debounceMs: 1000,
  cap: 20,
  drop: 'summarize',
  maxConcurrent: 1,
};

// ── MessageQueue ──────────────────────────────────────────────────────────────

/**
 * Lane-aware FIFO message queue.
 *
 * Each group gets its own lane (`session:<groupId>`). Within a lane only
 * `maxConcurrent` runs are active at once. When the active run finishes the
 * next queued message (or coalesced batch) is drained.
 *
 * Queue modes:
 *  - collect   (default) coalesce all queued messages into one followup run
 *  - followup  enqueue for the next turn after the current run ends
 *  - steer     inject into the current run immediately (falls back to followup)
 *  - interrupt abort the current run and start fresh with the newest message
 */
export class MessageQueue {
  private readonly lanes = new Map<string, LaneEntry[]>();
  private readonly active = new Map<string, number>();          // laneId → active run count
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly failed: LaneEntry[] = [];
  private handler: MessageHandler | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Register the handler that processes a single LaneEntry. Must be set before enqueue is called. */
  setHandler(fn: MessageHandler): void {
    this.handler = fn;
  }

  /** Enqueue an inbound message for processing. */
  enqueue(msg: InboundMessage, channel: IChannel, config: Partial<QueueConfig> = {}): void {
    const cfg: QueueConfig = { ...DEFAULT_CONFIG, ...config };
    const laneId = `session:${msg.groupId}`;

    const entry: LaneEntry = {
      id: randomUUID(),
      laneId,
      msg,
      channel,
      enqueuedAt: Date.now(),
      attempts: 0,
    };

    let lane = this.lanes.get(laneId);
    if (!lane) {
      lane = [];
      this.lanes.set(laneId, lane);
    }

    // ── Overflow check ───────────────────────────────────────────────────────
    if (lane.length >= cfg.cap) {
      this.applyOverflow(lane, entry, cfg.drop);
      return;
    }

    // ── Mode-specific handling ────────────────────────────────────────────────
    const activeCount = this.active.get(laneId) ?? 0;

    if (activeCount === 0) {
      // No active run — queue directly and schedule drain
      lane.push(entry);
      this.scheduleDrain(laneId, cfg);
      return;
    }

    // Active run in progress
    if (cfg.mode === 'interrupt') {
      // Drop everything queued, put the new message first
      lane.length = 0;
      lane.push(entry);
      this.scheduleDrain(laneId, cfg);
      return;
    }

    if (cfg.mode === 'steer') {
      // Steer is only meaningful for streaming (not implemented yet); fall back to followup
      lane.push(entry);
      this.scheduleDrain(laneId, cfg);
      return;
    }

    // collect / followup — append and let debounce coalesce
    lane.push(entry);
    if (cfg.mode === 'collect') {
      this.scheduleDebounce(laneId, cfg);
    } else {
      this.scheduleDrain(laneId, cfg);
    }
  }

  stats(): QueueStats {
    let queued = 0;
    for (const lane of this.lanes.values()) queued += lane.length;
    let active = 0;
    for (const n of this.active.values()) active += n;
    return { lanes: this.lanes.size, queued, active, failed: this.failed.length };
  }

  getFailedEntries(): LaneEntry[] {
    return [...this.failed];
  }

  clearFailed(): void {
    this.failed.length = 0;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /** Schedule immediate drain (no debounce). */
  private scheduleDrain(laneId: string, cfg: QueueConfig): void {
    // Cancel any pending debounce for this lane
    const t = this.debounceTimers.get(laneId);
    if (t) { clearTimeout(t); this.debounceTimers.delete(laneId); }
    void this.drain(laneId, cfg);
  }

  /** Debounce-then-drain: waits for quiet before starting a collect run. */
  private scheduleDebounce(laneId: string, cfg: QueueConfig): void {
    const existing = this.debounceTimers.get(laneId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.debounceTimers.delete(laneId);
      void this.drain(laneId, cfg);
    }, cfg.debounceMs);
    this.debounceTimers.set(laneId, t);
  }

  /** Drain one batch from a lane. Coalesces when mode=collect. */
  private async drain(laneId: string, cfg: QueueConfig): Promise<void> {
    if (!this.handler) return;

    const activeCount = this.active.get(laneId) ?? 0;
    if (activeCount >= cfg.maxConcurrent) return;

    const lane = this.lanes.get(laneId);
    if (!lane || lane.length === 0) {
      this.lanes.delete(laneId);
      return;
    }

    let entry: LaneEntry;

    if (cfg.mode === 'collect' && lane.length > 1) {
      // Coalesce: merge all queued messages into the first entry's content
      const first = lane.shift()!;
      const rest = lane.splice(0, lane.length);
      const combined = [first.msg.content, ...rest.map(e => e.msg.content)].join('\n\n---\n\n');
      entry = {
        ...first,
        msg: { ...first.msg, content: combined },
      };
    } else {
      entry = lane.shift()!;
    }

    if (lane.length === 0) this.lanes.delete(laneId);

    this.active.set(laneId, (this.active.get(laneId) ?? 0) + 1);
    entry.attempts += 1;

    try {
      await this.handler(entry);
    } catch (e) {
      entry.lastError = e instanceof Error ? e.message : String(e);
      this.failed.push(entry);
    } finally {
      const cur = this.active.get(laneId) ?? 1;
      if (cur <= 1) this.active.delete(laneId);
      else this.active.set(laneId, cur - 1);

      // Drain the next message if one arrived while we were running
      if ((this.lanes.get(laneId)?.length ?? 0) > 0) {
        void this.drain(laneId, cfg);
      }
    }
  }

  /** Apply overflow policy when the lane is at capacity. */
  private applyOverflow(lane: LaneEntry[], incoming: LaneEntry, policy: DropPolicy): void {
    if (policy === 'new') {
      // Silently drop the incoming message
      return;
    }
    if (policy === 'old') {
      // Drop the oldest (first) queued message and append new
      lane.shift();
      lane.push(incoming);
      return;
    }
    // 'summarize': replace oldest with a synthetic summary entry
    const oldest = lane.shift();
    if (oldest) {
      const summary: LaneEntry = {
        ...oldest,
        id: randomUUID(),
        msg: {
          ...oldest.msg,
          content: `[Dropped message — queue full. Summary: "${oldest.msg.content.slice(0, 80)}…"]`,
        },
        enqueuedAt: Date.now(),
      };
      lane.unshift(summary);
    }
    lane.push(incoming);
  }
}
