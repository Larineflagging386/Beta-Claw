import { randomUUID } from 'node:crypto';
import { z } from 'zod';

enum MessagePriority {
  CRITICAL = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
}

const QueuedMessageSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().min(1),
  content: z.string(),
  priority: z.nativeEnum(MessagePriority),
  timestamp: z.number(),
});

interface QueuedMessage {
  id: string;
  groupId: string;
  content: string;
  priority: MessagePriority;
  timestamp: number;
}

class GroupQueue {
  private readonly queues = new Map<string, QueuedMessage[]>();
  private readonly processedIds = new Set<string>();

  enqueue(
    groupId: string,
    content: string,
    priority: MessagePriority = MessagePriority.NORMAL,
  ): string {
    const id = randomUUID();

    if (this.processedIds.has(id)) {
      return id;
    }

    const message: QueuedMessage = {
      id,
      groupId,
      content,
      priority,
      timestamp: Date.now(),
    };

    QueuedMessageSchema.parse(message);

    let queue = this.queues.get(groupId);
    if (!queue) {
      queue = [];
      this.queues.set(groupId, queue);
    }

    queue.push(message);
    return id;
  }

  dequeue(groupId: string): QueuedMessage | undefined {
    const queue = this.queues.get(groupId);
    if (!queue || queue.length === 0) return undefined;

    let bestIdx = 0;
    let best = queue[0]!;

    for (let i = 1; i < queue.length; i++) {
      const msg = queue[i]!;
      if (
        msg.priority < best.priority ||
        (msg.priority === best.priority && msg.timestamp < best.timestamp)
      ) {
        best = msg;
        bestIdx = i;
      }
    }

    queue.splice(bestIdx, 1);
    this.processedIds.add(best.id);

    if (queue.length === 0) {
      this.queues.delete(groupId);
    }

    return best;
  }

  peek(groupId: string): QueuedMessage | undefined {
    const queue = this.queues.get(groupId);
    if (!queue || queue.length === 0) return undefined;

    let best = queue[0]!;

    for (let i = 1; i < queue.length; i++) {
      const msg = queue[i]!;
      if (
        msg.priority < best.priority ||
        (msg.priority === best.priority && msg.timestamp < best.timestamp)
      ) {
        best = msg;
      }
    }

    return best;
  }

  length(groupId: string): number {
    return this.queues.get(groupId)?.length ?? 0;
  }

  clear(groupId: string): void {
    this.queues.delete(groupId);
  }

  activeGroups(): string[] {
    return Array.from(this.queues.keys()).filter((gid) => {
      const queue = this.queues.get(gid);
      return queue !== undefined && queue.length > 0;
    });
  }

  isProcessed(messageId: string): boolean {
    return this.processedIds.has(messageId);
  }
}

export { GroupQueue, MessagePriority, QueuedMessageSchema };
export type { QueuedMessage };
