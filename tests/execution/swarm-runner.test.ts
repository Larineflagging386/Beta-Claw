import { describe, it, expect } from 'vitest';
import {
  SwarmRunner,
  SwarmTimeoutError,
} from '../../src/execution/swarm-runner.js';
import type { AgentNode } from '../../src/execution/dag-executor.js';

function node(id: string, dependsOn: string[] = []): AgentNode {
  return { id, agentType: 'test', brief: `task-${id}`, dependsOn };
}

describe('SwarmRunner', () => {
  it('runs a simple plan', async () => {
    const runner = new SwarmRunner();
    const plan = [node('a'), node('b', ['a'])];

    const results = await runner.run(plan);

    expect(results.size).toBe(2);
    expect(results.has('a')).toBe(true);
    expect(results.has('b')).toBe(true);
  });

  it('runs a complex parallel plan', async () => {
    const runner = new SwarmRunner({ maxParallel: 4 });
    const plan = [
      node('a'),
      node('b'),
      node('c', ['a']),
      node('d', ['a', 'b']),
      node('e', ['c', 'd']),
    ];

    const results = await runner.run(plan);

    expect(results.size).toBe(5);
    for (const n of plan) {
      expect(results.has(n.id)).toBe(true);
    }
  });

  it('tracks execution metrics', async () => {
    const runner = new SwarmRunner();
    const plan = [node('a'), node('b'), node('c')];

    await runner.run(plan);
    const metrics = runner.getMetrics();

    expect(metrics.nodesExecuted).toBe(3);
    expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.maxParallelism).toBeGreaterThanOrEqual(1);
  });

  it('handles timeout', async () => {
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const slowExecutor = async (_node: AgentNode) => {
      await delay(500);
      return 'slow-result';
    };

    const runner = new SwarmRunner({ timeoutMs: 50 }, slowExecutor);
    const plan = [node('a')];

    await expect(runner.run(plan)).rejects.toThrow(SwarmTimeoutError);
  });

  it('handles empty plan', async () => {
    const runner = new SwarmRunner();
    const results = await runner.run([]);

    expect(results.size).toBe(0);

    const metrics = runner.getMetrics();
    expect(metrics.nodesExecuted).toBe(0);
    expect(metrics.maxParallelism).toBe(0);
  });

  it('respects max parallelism', async () => {
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const slowExecutor = async (n: AgentNode) => {
      await delay(30);
      return `result-${n.id}`;
    };

    const runner = new SwarmRunner({ maxParallel: 2, timeoutMs: 5000 }, slowExecutor);
    const plan = [node('a'), node('b'), node('c'), node('d')];

    const results = await runner.run(plan);

    expect(results.size).toBe(4);
    const metrics = runner.getMetrics();
    expect(metrics.maxParallelism).toBeLessThanOrEqual(2);
  });

  it('passes custom executor results through TOON roundtrip', async () => {
    const customExecutor = async (n: AgentNode) => `custom-${n.id}`;
    const runner = new SwarmRunner(undefined, customExecutor);
    const plan = [node('x')];

    const results = await runner.run(plan);
    expect(results.get('x')).toBe('custom-x');
  });

  it('returns fresh metrics copy', async () => {
    const runner = new SwarmRunner();
    await runner.run([node('a')]);

    const m1 = runner.getMetrics();
    const m2 = runner.getMetrics();
    expect(m1).toEqual(m2);
    expect(m1).not.toBe(m2);
  });
});
