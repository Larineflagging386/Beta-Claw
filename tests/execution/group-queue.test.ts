import { describe, it, expect, beforeEach } from 'vitest';
import {
  GroupQueue,
  MessagePriority,
  QueuedMessageSchema,
} from '../../src/execution/group-queue.js';

describe('GroupQueue', () => {
  let queue: GroupQueue;

  beforeEach(() => {
    queue = new GroupQueue();
  });

  it('enqueue and dequeue returns the message', () => {
    const id = queue.enqueue('group1', 'hello');

    const msg = queue.dequeue('group1');
    expect(msg).toBeDefined();
    expect(msg!.id).toBe(id);
    expect(msg!.groupId).toBe('group1');
    expect(msg!.content).toBe('hello');
    expect(msg!.priority).toBe(MessagePriority.NORMAL);
    expect(typeof msg!.timestamp).toBe('number');
  });

  it('priority ordering: CRITICAL dequeued before NORMAL', () => {
    queue.enqueue('g1', 'normal msg', MessagePriority.NORMAL);
    queue.enqueue('g1', 'critical msg', MessagePriority.CRITICAL);
    queue.enqueue('g1', 'high msg', MessagePriority.HIGH);
    queue.enqueue('g1', 'low msg', MessagePriority.LOW);

    const first = queue.dequeue('g1');
    expect(first!.content).toBe('critical msg');
    expect(first!.priority).toBe(MessagePriority.CRITICAL);

    const second = queue.dequeue('g1');
    expect(second!.content).toBe('high msg');
    expect(second!.priority).toBe(MessagePriority.HIGH);

    const third = queue.dequeue('g1');
    expect(third!.content).toBe('normal msg');
    expect(third!.priority).toBe(MessagePriority.NORMAL);

    const fourth = queue.dequeue('g1');
    expect(fourth!.content).toBe('low msg');
    expect(fourth!.priority).toBe(MessagePriority.LOW);
  });

  it('FIFO within same priority', () => {
    queue.enqueue('g1', 'first');
    queue.enqueue('g1', 'second');
    queue.enqueue('g1', 'third');

    expect(queue.dequeue('g1')!.content).toBe('first');
    expect(queue.dequeue('g1')!.content).toBe('second');
    expect(queue.dequeue('g1')!.content).toBe('third');
  });

  it('peek returns next message without removing it', () => {
    queue.enqueue('g1', 'peeked');

    const peeked = queue.peek('g1');
    expect(peeked).toBeDefined();
    expect(peeked!.content).toBe('peeked');

    expect(queue.length('g1')).toBe(1);

    const peekedAgain = queue.peek('g1');
    expect(peekedAgain!.id).toBe(peeked!.id);

    const dequeued = queue.dequeue('g1');
    expect(dequeued!.id).toBe(peeked!.id);
    expect(queue.length('g1')).toBe(0);
  });

  it('clear removes all messages for a group', () => {
    queue.enqueue('g1', 'msg1');
    queue.enqueue('g1', 'msg2');
    queue.enqueue('g1', 'msg3');
    expect(queue.length('g1')).toBe(3);

    queue.clear('g1');
    expect(queue.length('g1')).toBe(0);
    expect(queue.dequeue('g1')).toBeUndefined();
  });

  it('length tracks queue size accurately', () => {
    expect(queue.length('g1')).toBe(0);

    queue.enqueue('g1', 'a');
    expect(queue.length('g1')).toBe(1);

    queue.enqueue('g1', 'b');
    expect(queue.length('g1')).toBe(2);

    queue.dequeue('g1');
    expect(queue.length('g1')).toBe(1);

    queue.dequeue('g1');
    expect(queue.length('g1')).toBe(0);
  });

  it('activeGroups lists groups with pending messages', () => {
    expect(queue.activeGroups()).toEqual([]);

    queue.enqueue('alpha', 'msg');
    queue.enqueue('beta', 'msg');
    queue.enqueue('gamma', 'msg');

    const groups = queue.activeGroups();
    expect(groups.length).toBe(3);
    expect(groups).toContain('alpha');
    expect(groups).toContain('beta');
    expect(groups).toContain('gamma');

    queue.clear('beta');
    const after = queue.activeGroups();
    expect(after.length).toBe(2);
    expect(after).not.toContain('beta');
  });

  it('multiple groups are independent', () => {
    queue.enqueue('g1', 'g1-msg');
    queue.enqueue('g2', 'g2-msg');

    expect(queue.length('g1')).toBe(1);
    expect(queue.length('g2')).toBe(1);

    const msg1 = queue.dequeue('g1');
    expect(msg1!.content).toBe('g1-msg');
    expect(msg1!.groupId).toBe('g1');

    expect(queue.length('g1')).toBe(0);
    expect(queue.length('g2')).toBe(1);

    const msg2 = queue.dequeue('g2');
    expect(msg2!.content).toBe('g2-msg');
    expect(msg2!.groupId).toBe('g2');
  });

  it('dequeue from empty queue returns undefined', () => {
    expect(queue.dequeue('nonexistent')).toBeUndefined();

    queue.enqueue('g1', 'only');
    queue.dequeue('g1');
    expect(queue.dequeue('g1')).toBeUndefined();
  });

  it('marks dequeued messages as processed', () => {
    const id = queue.enqueue('g1', 'tracked');

    expect(queue.isProcessed(id)).toBe(false);

    queue.dequeue('g1');

    expect(queue.isProcessed(id)).toBe(true);
  });

  it('enqueued messages pass Zod validation', () => {
    queue.enqueue('g1', 'validated', MessagePriority.HIGH);

    const msg = queue.dequeue('g1');
    expect(msg).toBeDefined();

    const result = QueuedMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('peek respects priority ordering', () => {
    queue.enqueue('g1', 'low', MessagePriority.LOW);
    queue.enqueue('g1', 'critical', MessagePriority.CRITICAL);

    const peeked = queue.peek('g1');
    expect(peeked!.content).toBe('critical');
    expect(queue.length('g1')).toBe(2);
  });
});
