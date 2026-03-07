import { describe, it, expect } from 'vitest';
import { PlannerAgent } from '../../src/agents/planner.js';
import { decode } from '../../src/core/toon-serializer.js';
import type { AgentTask } from '../../src/agents/types.js';

function makeTask(brief: string): AgentTask {
  return {
    id: 'task_001',
    type: 'plan',
    brief,
    groupId: 'grp_001',
    sessionId: 'sess_001',
  };
}

describe('PlannerAgent', () => {
  const planner = new PlannerAgent();

  it('has correct type property', () => {
    expect(planner.type).toBe('planner');
  });

  it('decompose simple message produces single step + composer', () => {
    const steps = planner.decompose('hello there');
    expect(steps.length).toBe(2);
    expect(steps[0]!.agentType).not.toBe('composer');
    expect(steps[steps.length - 1]!.agentType).toBe('composer');
  });

  it('decompose complex message produces multiple steps', () => {
    const steps = planner.decompose('search for info and run the code and remember this');
    expect(steps.length).toBeGreaterThanOrEqual(4);
    const types = steps.map((s) => s.agentType);
    expect(types).toContain('research');
    expect(types).toContain('execution');
    expect(types).toContain('memory');
    expect(types).toContain('composer');
  });

  it('detects research keywords and includes research agent', () => {
    const steps = planner.decompose('search for the latest news');
    const types = steps.map((s) => s.agentType);
    expect(types).toContain('research');
  });

  it('detects code/execution keywords and includes execution agent', () => {
    const steps = planner.decompose('run the build command');
    const types = steps.map((s) => s.agentType);
    expect(types).toContain('execution');
  });

  it('detects memory keywords and includes memory agent', () => {
    const steps = planner.decompose('remember my preference for dark mode');
    const types = steps.map((s) => s.agentType);
    expect(types).toContain('memory');
  });

  it('always includes composer as the last step', () => {
    for (const msg of ['hello', 'search foo', 'run code', 'remember this']) {
      const steps = planner.decompose(msg);
      expect(steps[steps.length - 1]!.agentType).toBe('composer');
    }
  });

  it('dependency graph: composer depends on all prior steps', () => {
    const steps = planner.decompose('search the web and run a script');
    const composer = steps[steps.length - 1]!;
    expect(composer.agentType).toBe('composer');
    expect(composer.dependsOn.length).toBe(steps.length - 1);
    expect(composer.parallel).toBe(false);
  });

  it('non-composer steps can run in parallel', () => {
    const steps = planner.decompose('search for docs and run the build');
    const nonComposer = steps.filter((s) => s.agentType !== 'composer');
    for (const step of nonComposer) {
      expect(step.parallel).toBe(true);
    }
  });

  it('execute returns valid TOON @plan block', async () => {
    const result = await planner.execute(makeTask('search something'));
    const parsed = decode(result.output);
    expect(parsed.type).toBe('plan');
    expect(parsed.data['taskId']).toBe('task_001');
    expect(typeof parsed.data['stepCount']).toBe('number');
  });

  it('execute returns correct agentType', async () => {
    const result = await planner.execute(makeTask('hello'));
    expect(result.agentType).toBe('planner');
  });

  it('execute returns correct taskId', async () => {
    const result = await planner.execute(makeTask('hello'));
    expect(result.taskId).toBe('task_001');
  });

  it('execute completes under 5ms (no LLM calls)', async () => {
    const result = await planner.execute(makeTask('search and run code'));
    expect(result.durationMs).toBeLessThan(5);
  });

  it('tokensUsed is a positive integer', async () => {
    const result = await planner.execute(makeTask('search something'));
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(Number.isInteger(result.tokensUsed)).toBe(true);
  });
});
