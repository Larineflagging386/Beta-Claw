import { z } from 'zod';
import { encode, decode } from '../core/toon-serializer.js';
import { executeDAG, AgentNodeSchema, type AgentNode } from './dag-executor.js';

const SwarmConfigSchema = z.object({
  maxParallel: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

interface SwarmConfig {
  maxParallel: number;
  timeoutMs: number;
}

interface SwarmMetrics {
  nodesExecuted: number;
  totalDurationMs: number;
  maxParallelism: number;
}

const DEFAULT_CONFIG: SwarmConfig = {
  maxParallel: 4,
  timeoutMs: 30_000,
};

async function defaultAgentExecutor(node: AgentNode): Promise<string> {
  return `Result for ${node.brief}`;
}

class Semaphore {
  private permits: number;
  private readonly waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        resolve();
      });
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }
}

class SwarmTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Swarm execution timed out after ${timeoutMs}ms`);
    this.name = 'SwarmTimeoutError';
  }
}

class SwarmRunner {
  private readonly config: SwarmConfig;
  private readonly agentExecutor: (node: AgentNode) => Promise<string>;
  private metrics: SwarmMetrics = {
    nodesExecuted: 0,
    totalDurationMs: 0,
    maxParallelism: 0,
  };

  constructor(
    config?: Partial<SwarmConfig>,
    agentExecutor?: (node: AgentNode) => Promise<string>,
  ) {
    const merged = { ...DEFAULT_CONFIG, ...config };
    this.config = SwarmConfigSchema.parse(merged);
    this.agentExecutor = agentExecutor ?? defaultAgentExecutor;
  }

  async run(plan: AgentNode[]): Promise<Map<string, string>> {
    const validated = plan.map((node) => AgentNodeSchema.parse(node));

    if (validated.length === 0) {
      this.metrics = { nodesExecuted: 0, totalDurationMs: 0, maxParallelism: 0 };
      return new Map<string, string>();
    }

    const startTime = Date.now();
    let currentParallel = 0;
    let peakParallel = 0;
    const semaphore = new Semaphore(this.config.maxParallel);

    const executor = async (node: AgentNode): Promise<string> => {
      await semaphore.acquire();
      try {
        currentParallel++;
        if (currentParallel > peakParallel) {
          peakParallel = currentParallel;
        }
        const result = await this.agentExecutor(node);
        return encode('agent-result', { nodeId: node.id, output: result });
      } finally {
        currentParallel--;
        semaphore.release();
      }
    };

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new SwarmTimeoutError(this.config.timeoutMs)),
        this.config.timeoutMs,
      );
    });

    try {
      const dagResults = await Promise.race([
        executeDAG(validated, executor),
        timeoutPromise,
      ]);

      const results = new Map<string, string>();
      for (const [nodeId, toonResult] of dagResults) {
        const parsed = decode(toonResult);
        results.set(nodeId, String(parsed.data['output'] ?? ''));
      }

      const endTime = Date.now();
      this.metrics = {
        nodesExecuted: results.size,
        totalDurationMs: endTime - startTime,
        maxParallelism: peakParallel,
      };

      return results;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  getMetrics(): SwarmMetrics {
    return { ...this.metrics };
  }
}

export { SwarmRunner, SwarmTimeoutError, SwarmConfigSchema, Semaphore };
export type { SwarmConfig, SwarmMetrics };
