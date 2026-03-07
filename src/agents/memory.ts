import { encode } from '../core/toon-serializer.js';
import type { AgentTask, AgentResult, IAgent } from './types.js';
import { AgentTaskSchema } from './types.js';

export class MemoryAgent implements IAgent {
  readonly type = 'memory' as const;

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();

    const memoryResult = {
      operation: validated.brief,
      found: false,
      entries: [] as string[],
      status: 'pending',
    };

    const output = encode('memory_result', memoryResult as Record<string, unknown>);
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
