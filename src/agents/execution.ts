import { encode } from '../core/toon-serializer.js';
import type { AgentTask, AgentResult, IAgent } from './types.js';
import { AgentTaskSchema } from './types.js';

export class ExecutionAgent implements IAgent {
  readonly type = 'execution' as const;

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();

    const execResult = {
      command: validated.brief,
      exitCode: 0,
      stdout: '',
      stderr: '',
      status: 'pending',
    };

    const output = encode('exec_result', execResult as Record<string, unknown>);
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
