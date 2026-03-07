import { encode } from '../core/toon-serializer.js';
import type { AgentTask, AgentResult, IAgent, PlanStep } from './types.js';
import { AgentTaskSchema } from './types.js';

const RESEARCH_KEYWORDS = [
  'search', 'find', 'lookup', 'research', 'what is', 'who is',
  'how does', 'explain', 'define', 'information', 'learn about',
  'google', 'browse', 'web', 'article', 'source',
];

const EXECUTION_KEYWORDS = [
  'code', 'run', 'execute', 'file', 'command', 'script', 'compile',
  'build', 'deploy', 'install', 'create file', 'write code', 'terminal',
  'shell', 'mkdir', 'delete', 'move', 'copy', 'npm', 'git',
];

const MEMORY_KEYWORDS = [
  'remember', 'recall', 'forget', 'memorize', 'you told me',
  'last time', 'previously', 'history', 'save this', 'note that',
  'store', 'retrieve', 'what did i', 'what was',
];

function matchesKeywords(message: string, keywords: readonly string[]): boolean {
  const lower = message.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export class PlannerAgent implements IAgent {
  readonly type = 'planner' as const;

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();

    const steps = this.decompose(validated.brief);
    const planData: Record<string, unknown> = {
      taskId: validated.id,
      stepCount: steps.length,
      steps: steps.map((s, i) => ({
        id: `step_${i}`,
        agent: s.agentType,
        brief: s.brief,
        dependsOn: s.dependsOn,
        parallel: s.parallel,
      })),
    };

    const output = encode('plan', planData);
    const durationMs = performance.now() - start;

    return {
      taskId: validated.id,
      agentType: this.type,
      output,
      tokensUsed: Math.ceil(output.length / 4),
      durationMs,
    };
  }

  decompose(message: string): PlanStep[] {
    const steps: PlanStep[] = [];
    const stepIds: string[] = [];

    if (matchesKeywords(message, RESEARCH_KEYWORDS)) {
      const id = `step_${stepIds.length}`;
      stepIds.push(id);
      steps.push({
        agentType: 'research',
        brief: `Research: ${message}`,
        dependsOn: [],
        parallel: true,
      });
    }

    if (matchesKeywords(message, EXECUTION_KEYWORDS)) {
      const id = `step_${stepIds.length}`;
      stepIds.push(id);
      steps.push({
        agentType: 'execution',
        brief: `Execute: ${message}`,
        dependsOn: [],
        parallel: true,
      });
    }

    if (matchesKeywords(message, MEMORY_KEYWORDS)) {
      const id = `step_${stepIds.length}`;
      stepIds.push(id);
      steps.push({
        agentType: 'memory',
        brief: `Memory: ${message}`,
        dependsOn: [],
        parallel: true,
      });
    }

    if (steps.length === 0) {
      const id = `step_${stepIds.length}`;
      stepIds.push(id);
      steps.push({
        agentType: 'research',
        brief: `Default research: ${message}`,
        dependsOn: [],
        parallel: false,
      });
    }

    steps.push({
      agentType: 'composer',
      brief: 'Compose final response from agent results',
      dependsOn: [...stepIds],
      parallel: false,
    });

    return steps;
  }
}
