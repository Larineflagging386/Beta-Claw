import { describe, it, expect } from 'vitest';
import {
  executeDAG,
  validateNodes,
  serializeNode,
  CycleDetectedError,
  type AgentNode,
} from '../../src/execution/dag-executor.js';

function node(id: string, dependsOn: string[] = []): AgentNode {
  return { id, agentType: 'test', brief: `task-${id}`, dependsOn };
}

const simpleExecutor = async (n: AgentNode) => `result-${n.id}`;

describe('DAG Executor', () => {
  it('executes a single node', async () => {
    const results = await executeDAG([node('a')], simpleExecutor);
    expect(results.size).toBe(1);
    expect(results.get('a')).toBe('result-a');
  });

  it('executes a linear dependency chain (A→B→C)', async () => {
    const order: string[] = [];
    const trackingExecutor = async (n: AgentNode) => {
      order.push(n.id);
      return `result-${n.id}`;
    };

    const nodes = [node('a'), node('b', ['a']), node('c', ['b'])];
    const results = await executeDAG(nodes, trackingExecutor);

    expect(results.size).toBe(3);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('executes parallel independent nodes', async () => {
    const nodes = [node('a'), node('b'), node('c')];
    const results = await executeDAG(nodes, simpleExecutor);

    expect(results.size).toBe(3);
    expect(results.get('a')).toBe('result-a');
    expect(results.get('b')).toBe('result-b');
    expect(results.get('c')).toBe('result-c');
  });

  it('handles diamond dependency (A→B,C→D)', async () => {
    const order: string[] = [];
    const trackingExecutor = async (n: AgentNode) => {
      order.push(n.id);
      return `result-${n.id}`;
    };

    const nodes = [
      node('a'),
      node('b', ['a']),
      node('c', ['a']),
      node('d', ['b', 'c']),
    ];
    const results = await executeDAG(nodes, trackingExecutor);

    expect(results.size).toBe(4);
    expect(order[0]).toBe('a');
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
  });

  it('handles complex DAG with mixed parallel/sequential', async () => {
    const order: string[] = [];
    const trackingExecutor = async (n: AgentNode) => {
      order.push(n.id);
      return `result-${n.id}`;
    };

    //   a   b
    //  / \ |
    // c   d
    //  \ /
    //   e
    const nodes = [
      node('a'),
      node('b'),
      node('c', ['a']),
      node('d', ['a', 'b']),
      node('e', ['c', 'd']),
    ];
    const results = await executeDAG(nodes, trackingExecutor);

    expect(results.size).toBe(5);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('e'));
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('e'));
  });

  it('throws CycleDetectedError on cycles', async () => {
    const nodes = [node('a', ['b']), node('b', ['a'])];
    await expect(executeDAG(nodes, simpleExecutor)).rejects.toThrow(
      CycleDetectedError,
    );
  });

  it('returns empty map for empty DAG', async () => {
    const results = await executeDAG([], simpleExecutor);
    expect(results.size).toBe(0);
    expect(results).toBeInstanceOf(Map);
  });

  it('collects all results in the map', async () => {
    const nodes = [
      node('x'),
      node('y', ['x']),
      node('z', ['x']),
    ];
    const results = await executeDAG(nodes, simpleExecutor);

    expect(results.size).toBe(3);
    for (const n of nodes) {
      expect(results.has(n.id)).toBe(true);
      expect(results.get(n.id)).toBe(`result-${n.id}`);
    }
  });

  it('respects dependency execution order', async () => {
    const order: string[] = [];
    const trackingExecutor = async (n: AgentNode) => {
      order.push(n.id);
      return `result-${n.id}`;
    };

    const nodes = [
      node('root'),
      node('mid1', ['root']),
      node('mid2', ['root']),
      node('leaf', ['mid1', 'mid2']),
    ];
    await executeDAG(nodes, trackingExecutor);

    const rootIdx = order.indexOf('root');
    const mid1Idx = order.indexOf('mid1');
    const mid2Idx = order.indexOf('mid2');
    const leafIdx = order.indexOf('leaf');

    expect(rootIdx).toBeLessThan(mid1Idx);
    expect(rootIdx).toBeLessThan(mid2Idx);
    expect(mid1Idx).toBeLessThan(leafIdx);
    expect(mid2Idx).toBeLessThan(leafIdx);
  });

  it('executes parallel nodes concurrently (timing)', async () => {
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const delayExecutor = async (n: AgentNode) => {
      await delay(100);
      return `result-${n.id}`;
    };

    const nodes = [node('a'), node('b'), node('c')];
    const start = Date.now();
    await executeDAG(nodes, delayExecutor);
    const elapsed = Date.now() - start;

    // Parallel: ~100ms. Sequential would be ~300ms.
    expect(elapsed).toBeLessThan(250);
  });

  it('throws on unknown dependency', async () => {
    const nodes = [node('a', ['nonexistent'])];
    await expect(executeDAG(nodes, simpleExecutor)).rejects.toThrow(
      /depends on unknown node/,
    );
  });

  it('validates nodes with Zod (rejects invalid)', async () => {
    const badNodes = [{ id: '', agentType: 'test', brief: 'bad', dependsOn: [] }];
    await expect(executeDAG(badNodes, simpleExecutor)).rejects.toThrow();
  });

  it('validates nodes via validateNodes helper', () => {
    const raw = [{ id: 'a', agentType: 'test', brief: 'hello', dependsOn: [] }];
    const validated = validateNodes(raw);
    expect(validated).toHaveLength(1);
    expect(validated[0]!.id).toBe('a');
  });

  it('serializes node to TOON via serializeNode', () => {
    const n = node('a');
    const toon = serializeNode(n);
    expect(toon).toContain('@agent-node{');
    expect(toon).toContain('id:a');
    expect(toon).toContain('agentType:test');
  });
});
