import { describe, it, expect } from 'vitest';
import { MemoryAgent } from '../../src/agents/memory.js';
import { decode } from '../../src/core/toon-serializer.js';
import type { AgentTask } from '../../src/agents/types.js';

function makeTask(brief: string): AgentTask {
  return {
    id: 'task_m01',
    type: 'memory',
    brief,
    groupId: 'grp_001',
    sessionId: 'sess_001',
  };
}

describe('MemoryAgent', () => {
  const agent = new MemoryAgent();

  it('has correct type property', () => {
    expect(agent.type).toBe('memory');
  });

  it('execute returns @memory_result TOON block', async () => {
    const result = await agent.execute(makeTask('remember my name'));
    const parsed = decode(result.output);
    expect(parsed.type).toBe('memory_result');
  });

  it('memory_result contains operation field matching brief', async () => {
    const result = await agent.execute(makeTask('recall last conversation'));
    const parsed = decode(result.output);
    expect(parsed.data['operation']).toBe('recall last conversation');
  });

  it('memory_result contains found field', async () => {
    const result = await agent.execute(makeTask('recall'));
    const parsed = decode(result.output);
    expect(typeof parsed.data['found']).toBe('boolean');
  });

  it('memory_result contains entries array', async () => {
    const result = await agent.execute(makeTask('recall'));
    const parsed = decode(result.output);
    expect(Array.isArray(parsed.data['entries'])).toBe(true);
  });

  it('memory_result has status field', async () => {
    const result = await agent.execute(makeTask('store'));
    const parsed = decode(result.output);
    expect(parsed.data['status']).toBe('pending');
  });

  it('returns correct agentType', async () => {
    const result = await agent.execute(makeTask('query'));
    expect(result.agentType).toBe('memory');
  });

  it('returns correct taskId', async () => {
    const result = await agent.execute(makeTask('query'));
    expect(result.taskId).toBe('task_m01');
  });

  it('executes under 5ms', async () => {
    const result = await agent.execute(makeTask('fast recall'));
    expect(result.durationMs).toBeLessThan(5);
  });

  it('output is valid TOON (re-parseable)', async () => {
    const result = await agent.execute(makeTask('test'));
    expect(() => decode(result.output)).not.toThrow();
  });

  it('tokensUsed is a positive integer', async () => {
    const result = await agent.execute(makeTask('test'));
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(Number.isInteger(result.tokensUsed)).toBe(true);
  });
});
