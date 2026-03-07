import { describe, it, expect } from 'vitest';
import { ExecutionAgent } from '../../src/agents/execution.js';
import { decode } from '../../src/core/toon-serializer.js';
import type { AgentTask } from '../../src/agents/types.js';

function makeTask(brief: string): AgentTask {
  return {
    id: 'task_e01',
    type: 'execution',
    brief,
    groupId: 'grp_001',
    sessionId: 'sess_001',
  };
}

describe('ExecutionAgent', () => {
  const agent = new ExecutionAgent();

  it('has correct type property', () => {
    expect(agent.type).toBe('execution');
  });

  it('execute returns @exec_result TOON block', async () => {
    const result = await agent.execute(makeTask('run npm install'));
    const parsed = decode(result.output);
    expect(parsed.type).toBe('exec_result');
  });

  it('exec_result contains command field', async () => {
    const result = await agent.execute(makeTask('list files in .'));
    const parsed = decode(result.output);
    expect(typeof parsed.data['command']).toBe('string');
  });

  it('exec_result contains exitCode field', async () => {
    const result = await agent.execute(makeTask('list files in .'));
    const parsed = decode(result.output);
    expect(typeof parsed.data['exitCode']).toBe('number');
  });

  it('exec_result contains stdout and stderr', async () => {
    const result = await agent.execute(makeTask('list files in .'));
    const parsed = decode(result.output);
    expect('stdout' in parsed.data).toBe(true);
    expect('stderr' in parsed.data).toBe(true);
  });

  it('exec_result has filesCreated array', async () => {
    const result = await agent.execute(makeTask('list files'));
    const parsed = decode(result.output);
    expect(Array.isArray(parsed.data['filesCreated'])).toBe(true);
  });

  it('returns correct agentType', async () => {
    const result = await agent.execute(makeTask('cmd'));
    expect(result.agentType).toBe('execution');
  });

  it('returns correct taskId', async () => {
    const result = await agent.execute(makeTask('cmd'));
    expect(result.taskId).toBe('task_e01');
  });

  it('executes in reasonable time', async () => {
    const result = await agent.execute(makeTask('list files in .'));
    expect(result.durationMs).toBeLessThan(5000);
  });

  it('output is valid TOON (re-parseable)', async () => {
    const result = await agent.execute(makeTask('list files'));
    expect(() => decode(result.output)).not.toThrow();
  });

  it('tokensUsed is a positive integer', async () => {
    const result = await agent.execute(makeTask('test'));
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(Number.isInteger(result.tokensUsed)).toBe(true);
  });
});
