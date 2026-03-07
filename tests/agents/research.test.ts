import { describe, it, expect } from 'vitest';
import { ResearchAgent } from '../../src/agents/research.js';
import { decode } from '../../src/core/toon-serializer.js';
import type { AgentTask } from '../../src/agents/types.js';

function makeTask(brief: string): AgentTask {
  return {
    id: 'task_r01',
    type: 'research',
    brief,
    groupId: 'grp_001',
    sessionId: 'sess_001',
  };
}

describe('ResearchAgent', () => {
  const agent = new ResearchAgent();

  it('has correct type property', () => {
    expect(agent.type).toBe('research');
  });

  it('execute returns @findings TOON block', async () => {
    const result = await agent.execute(makeTask('search for AI papers'));
    const parsed = decode(result.output);
    expect(parsed.type).toBe('findings');
  });

  it('findings contain query field', async () => {
    const result = await agent.execute(makeTask('what is TOON format'));
    const parsed = decode(result.output);
    expect(typeof parsed.data['query']).toBe('string');
    expect(String(parsed.data['query']).length).toBeGreaterThan(0);
  });

  it('findings contain sources array', async () => {
    const result = await agent.execute(makeTask('search'));
    const parsed = decode(result.output);
    expect(Array.isArray(parsed.data['sources'])).toBe(true);
  });

  it('findings contain summary field', async () => {
    const result = await agent.execute(makeTask('search'));
    const parsed = decode(result.output);
    expect(typeof parsed.data['summary']).toBe('string');
  });

  it('returns correct agentType', async () => {
    const result = await agent.execute(makeTask('query'));
    expect(result.agentType).toBe('research');
  });

  it('returns correct taskId', async () => {
    const result = await agent.execute(makeTask('query'));
    expect(result.taskId).toBe('task_r01');
  });

  it('executes in reasonable time', async () => {
    const result = await agent.execute(makeTask('quick search'));
    expect(result.durationMs).toBeLessThan(5000);
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
