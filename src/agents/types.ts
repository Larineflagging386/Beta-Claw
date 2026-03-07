import { z } from 'zod';

export interface AgentTask {
  id: string;
  type: string;
  brief: string;
  groupId: string;
  sessionId: string;
}

export interface AgentResult {
  taskId: string;
  agentType: string;
  output: string;
  tokensUsed: number;
  durationMs: number;
}

export interface IAgent {
  readonly type: string;
  execute(task: AgentTask): Promise<AgentResult>;
}

export interface PlanStep {
  agentType: 'research' | 'execution' | 'memory' | 'composer';
  brief: string;
  dependsOn: string[];
  parallel: boolean;
}

export const AgentTaskSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  brief: z.string(),
  groupId: z.string().min(1),
  sessionId: z.string().min(1),
});

export const AgentResultSchema = z.object({
  taskId: z.string().min(1),
  agentType: z.string().min(1),
  output: z.string(),
  tokensUsed: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});
