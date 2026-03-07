import { encode, decode } from '../core/toon-serializer.js';
import type { AgentTask, AgentResult, IAgent } from './types.js';
import { AgentTaskSchema, AgentResultSchema } from './types.js';

export class ResponseComposer implements IAgent {
  readonly type = 'composer' as const;

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();

    const composedOutput = encode('response', {
      taskId: validated.id,
      content: validated.brief,
      sources: [] as string[],
    } as Record<string, unknown>);
    const durationMs = performance.now() - start;

    return {
      taskId: validated.id,
      agentType: this.type,
      output: composedOutput,
      tokensUsed: Math.ceil(composedOutput.length / 4),
      durationMs,
    };
  }

  async compose(results: AgentResult[], task: AgentTask): Promise<string> {
    const validated = AgentTaskSchema.parse(task);
    const validatedResults = results.map((r) => AgentResultSchema.parse(r));

    const sections: string[] = [];
    for (const result of validatedResults) {
      const parsed = decode(result.output);
      const data = parsed.data as Record<string, unknown>;
      let content: string;
      if (typeof data['summary'] === 'string') {
        content = data['summary'];
      } else if (typeof data['content'] === 'string') {
        content = data['content'];
      } else if (typeof data['stdout'] === 'string') {
        content = data['stdout'];
      } else {
        content = result.output;
      }
      if (content.length > 0) {
        sections.push(content);
      }
    }

    if (sections.length === 0) {
      return encode('response', {
        taskId: validated.id,
        content: 'No results available.',
        sources: [] as string[],
      } as Record<string, unknown>);
    }

    return encode('response', {
      taskId: validated.id,
      content: sections.join('\n\n'),
      sources: [] as string[],
    } as Record<string, unknown>);
  }
}
