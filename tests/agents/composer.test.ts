import { describe, it, expect } from 'vitest';
import { ResponseComposer } from '../../src/agents/composer.js';
import { encode, decode } from '../../src/core/toon-serializer.js';
import type { AgentTask, AgentResult } from '../../src/agents/types.js';

function makeTask(brief: string): AgentTask {
  return {
    id: 'task_c01',
    type: 'compose',
    brief,
    groupId: 'grp_001',
    sessionId: 'sess_001',
  };
}

function makeResult(agentType: string, data: Record<string, unknown>): AgentResult {
  const toonType = agentType === 'research'
    ? 'findings'
    : agentType === 'execution'
      ? 'exec_result'
      : agentType === 'memory'
        ? 'memory_result'
        : 'response';

  return {
    taskId: 'task_c01',
    agentType,
    output: encode(toonType, data),
    tokensUsed: 10,
    durationMs: 1,
  };
}

describe('ResponseComposer', () => {
  const composer = new ResponseComposer();

  it('has correct type property', () => {
    expect(composer.type).toBe('composer');
  });

  it('execute returns valid TOON @response block', async () => {
    const result = await composer.execute(makeTask('compose output'));
    const parsed = decode(result.output);
    expect(parsed.type).toBe('response');
  });

  it('execute returns correct agentType', async () => {
    const result = await composer.execute(makeTask('compose'));
    expect(result.agentType).toBe('composer');
  });

  it('execute returns correct taskId', async () => {
    const result = await composer.execute(makeTask('compose'));
    expect(result.taskId).toBe('task_c01');
  });

  it('compose single result returns content', async () => {
    const results = [
      makeResult('research', { summary: 'Found relevant info about AI', sources: [] }),
    ];
    const output = await composer.compose(results, makeTask('summarize'));
    const parsed = decode(output);
    expect(parsed.type).toBe('response');
    const content = parsed.data['content'] as string;
    expect(content).toContain('Found relevant info about AI');
  });

  it('compose multiple results merges content', async () => {
    const results = [
      makeResult('research', { summary: 'Research findings here', sources: [] }),
      makeResult('execution', { stdout: 'Build succeeded', exitCode: 0, stderr: '' }),
    ];
    const output = await composer.compose(results, makeTask('summarize'));
    const parsed = decode(output);
    const content = parsed.data['content'] as string;
    expect(content).toContain('Research findings');
    expect(content).toContain('Build succeeded');
  });

  it('compose handles empty results array', async () => {
    const output = await composer.compose([], makeTask('summarize'));
    const parsed = decode(output);
    expect(parsed.type).toBe('response');
    const content = parsed.data['content'] as string;
    expect(content).toContain('No results available');
  });

  it('compose output is valid TOON', async () => {
    const results = [
      makeResult('research', { summary: 'test', sources: [] }),
    ];
    const output = await composer.compose(results, makeTask('test'));
    expect(() => decode(output)).not.toThrow();
  });

  it('execute completes under 5ms', async () => {
    const result = await composer.execute(makeTask('fast'));
    expect(result.durationMs).toBeLessThan(5);
  });

  it('tokensUsed is a positive integer', async () => {
    const result = await composer.execute(makeTask('test'));
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(Number.isInteger(result.tokensUsed)).toBe(true);
  });
});
