// src/execution/group-queue.ts

import EventEmitter from 'events';

interface QueuedMessage {
  id:       string;
  groupId:  string;
  payload:  unknown;
  resolve:  (result: unknown) => void;
  reject:   (err: Error) => void;
}

export class GroupQueue extends EventEmitter {
  private lanes   = new Map<string, QueuedMessage[]>();  // groupId → queue
  private active  = new Map<string, boolean>();           // groupId → processing?
  private cap:    number;
  private handler: (msg: QueuedMessage) => Promise<unknown>;

  constructor(opts: { cap?: number; handler: (msg: QueuedMessage) => Promise<unknown> }) {
    super();
    this.cap     = opts.cap ?? 100;
    this.handler = opts.handler;
  }

  enqueue(groupId: string, id: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let lane = this.lanes.get(groupId);
      if (!lane) { lane = []; this.lanes.set(groupId, lane); }

      // Drop oldest if over cap
      if (lane.length >= this.cap) {
        const dropped = lane.shift();
        dropped?.reject(new Error('Queue cap exceeded — message dropped'));
        this.emit('drop', { groupId, id });
      }

      lane.push({ id, groupId, payload, resolve, reject });
      this.emit('enqueue', { groupId, id, depth: lane.length });

      // Kick off processing for this lane if not already running.
      // setImmediate ensures we don't block the caller.
      setImmediate(() => this.drain(groupId));
    });
  }

  private async drain(groupId: string): Promise<void> {
    // If this lane is already being drained, do nothing — the running drain() will loop.
    if (this.active.get(groupId)) return;
    this.active.set(groupId, true);

    const lane = this.lanes.get(groupId);
    if (!lane) { this.active.delete(groupId); return; }

    // Process ALL messages in the lane sequentially (one lane = one concurrent worker).
    while (lane.length > 0) {
      const msg = lane.shift()!;
      try {
        const result = await this.handler(msg);
        msg.resolve(result);
        this.emit('processed', { groupId, id: msg.id });
      } catch (e) {
        msg.reject(e instanceof Error ? e : new Error(String(e)));
        this.emit('error', { groupId, id: msg.id, err: e });
      }
    }

    this.active.delete(groupId);

    // Check if more messages arrived while we were processing.
    const refilled = this.lanes.get(groupId);
    if (refilled && refilled.length > 0) {
      setImmediate(() => this.drain(groupId));
    }
  }

  depth(groupId: string): number {
    return this.lanes.get(groupId)?.length ?? 0;
  }

  activeGroups(): string[] {
    return [...this.active.keys()];
  }
}
