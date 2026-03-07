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

  it('exec_result contains command field matching brief', async () => {
    const result = await agent.execute(makeTask('git status'));
    const parsed = decode(result.output);
    expect(parsed.data['command']).toBe('git status');
  });

  it('exec_result contains exitCode field', async () => {
    const result = await agent.execute(makeTask('ls'));
    const parsed = decode(result.output);
    expect(parsed.data['exitCode']).toBe(0);
  });

  it('exec_result contains stdout and stderr', async () => {
    const result = await agent.execute(makeTask('echo hello'));
    const parsed = decode(result.output);
    expect('stdout' in parsed.data).toBe(true);
    expect('stderr' in parsed.data).toBe(true);
  });

  it('exec_result has status field', async () => {
    const result = await agent.execute(makeTask('run'));
    const parsed = decode(result.output);
    expect(parsed.data['status']).toBe('pending');
  });

  it('returns correct agentType', async () => {
    const result = await agent.execute(makeTask('cmd'));
    expect(result.agentType).toBe('execution');
  });

  it('returns correct taskId', async () => {
    const result = await agent.execute(makeTask('cmd'));
    expect(result.taskId).toBe('task_e01');
  });

  it('executes under 5ms', async () => {
    const result = await agent.execute(makeTask('fast command'));
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
