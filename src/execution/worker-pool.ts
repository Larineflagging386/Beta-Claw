import os from 'node:os';
import { z } from 'zod';
import { encode, decode } from '../core/toon-serializer.js';

const TaskSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

type TaskPayload = z.infer<typeof TaskSchema>;

const POOL_SIZES: Record<string, number> = {
  micro: 0,
  lite: 1,
  standard: 2,
  full: Math.max(1, os.cpus().length - 1),
};

interface QueuedTask<T = unknown> {
  toonData: string;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

class WorkerPool {
  private readonly poolSize: number;
  private busyCount = 0;
  private taskQueue: QueuedTask[] = [];
  private isShutdown = false;

  constructor(size?: number) {
    this.poolSize = size ?? Math.max(1, os.cpus().length - 1);
  }

  static fromProfile(profile: string): WorkerPool {
    const size = POOL_SIZES[profile];
    if (size === undefined) {
      throw new Error(`Unknown resource profile: ${profile}`);
    }
    return new WorkerPool(size);
  }

  submit<T>(task: { type: string; data: unknown }): Promise<T> {
    if (this.isShutdown) {
      return Promise.reject(new Error('Pool is shut down'));
    }

    const validated = TaskSchema.parse(task);
    const toonData = encode('task', {
      type: validated.type,
      data: validated.data,
    });

    return new Promise<T>((resolve, reject) => {
      const queued: QueuedTask = {
        toonData,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      if (this.poolSize === 0 || this.busyCount < this.poolSize) {
        this.executeTask(queued);
      } else {
        this.taskQueue.push(queued);
      }
    });
  }

  private executeTask(queued: QueuedTask): void {
    this.busyCount++;

    queueMicrotask(() => {
      try {
        const parsed = decode(queued.toonData);
        const result = parsed.data['data'] ?? null;
        queued.resolve(result);
      } catch (err: unknown) {
        queued.reject(err);
      } finally {
        this.busyCount--;
        this.drainQueue();
      }
    });
  }

  private drainQueue(): void {
    while (
      this.taskQueue.length > 0 &&
      (this.poolSize === 0 || this.busyCount < this.poolSize)
    ) {
      const next = this.taskQueue.shift();
      if (next) {
        this.executeTask(next);
      }
    }
  }

  async shutdown(): Promise<void> {
    this.isShutdown = true;
    while (this.busyCount > 0) {
      await new Promise<void>((r) => setTimeout(r, 1));
    }
    for (const queued of this.taskQueue) {
      queued.reject(new Error('Pool shutting down'));
    }
    this.taskQueue = [];
  }

  stats(): { total: number; busy: number; idle: number; queued: number } {
    return {
      total: this.poolSize,
      busy: this.busyCount,
      idle: this.poolSize === 0 ? 0 : Math.max(0, this.poolSize - this.busyCount),
      queued: this.taskQueue.length,
    };
  }
}

export { WorkerPool, POOL_SIZES, TaskSchema };
export type { TaskPayload, QueuedTask };
