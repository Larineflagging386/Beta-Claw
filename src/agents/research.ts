import { encode } from '../core/toon-serializer.js';
import type { AgentTask, AgentResult, IAgent } from './types.js';
import { AgentTaskSchema } from './types.js';

export class ResearchAgent implements IAgent {
  readonly type = 'research' as const;

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();

    const findings = {
      query: validated.brief,
      sources: [] as string[],
      relevance: 0,
      summary: '',
      status: 'pending',
    };

    const output = encode('findings', findings as Record<string, unknown>);
    const durationMs = performance.now() - start;

    return {
      taskId: validated.id,
      agentType: this.type,
      output,
      tokensUsed: Math.ceil(output.length / 4),
      durationMs,
    };
  }
}
