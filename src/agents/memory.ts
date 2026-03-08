import crypto from 'node:crypto';
import { encode } from '../core/toon-serializer.js';
import { EpisodicMemory } from '../memory/episodic.js';
import { SemanticMemory } from '../memory/semantic.js';
import { Retriever } from '../memory/retriever.js';
import { MicroClawDB } from '../db.js';
import { DB_PATH } from '../core/paths.js';
import type { AgentTask, AgentResult, IAgent } from './types.js';
import { AgentTaskSchema } from './types.js';

type MemOp = 'write' | 'read' | 'summarize';

const WRITE_KEYWORDS = ['save', 'remember', 'note', 'store', 'memorize', 'record', 'SUMMARIZE'];
const READ_KEYWORDS = ['recall', 'history', 'what did', 'what was', 'what is my', "what's my", 'do you remember', 'do you know'];

function detectOp(brief: string): MemOp {
  const lower = brief.toLowerCase();
  if (lower.includes('summarize')) return 'summarize';
  if (WRITE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return 'write';
  if (READ_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))) return 'read';
  return 'write';
}

function extractContent(brief: string): string {
  const prefixPatterns = [
    /^(?:Memory|SUMMARIZE)[:\s]+/i,
    /^(?:save|remember|note|store|memorize|record)[:\s]+/i,
    /^SUMMARIZE and save this to memory[:\s]+/i,
  ];
  let content = brief;
  for (const p of prefixPatterns) {
    content = content.replace(p, '');
  }
  return content.trim();
}

export class MemoryAgent implements IAgent {
  readonly type = 'memory' as const;

  private static _sharedDB: MicroClawDB | null = null;

  static setDB(db: MicroClawDB): void {
    MemoryAgent._sharedDB = db;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();
    const brief = validated.brief;
    const op = detectOp(brief);
    const groupId = validated.groupId;
    const content = extractContent(brief);

    if (!MemoryAgent._sharedDB) {
      const { mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      mkdirSync(dirname(DB_PATH), { recursive: true });
    }
    const db = MemoryAgent._sharedDB ?? new MicroClawDB(DB_PATH);
    const episodic = new EpisodicMemory();
    const semantic = new SemanticMemory(db);
    const retriever = new Retriever(db);

    let found = false;
    const entries: string[] = [];
    let updated = false;

    try {
      switch (op) {
        case 'write':
        case 'summarize': {
          await episodic.update(groupId, 'Session Memory', content);

          const chunkId = `mem-${crypto.randomUUID()}`;
          semantic.index(chunkId, content, groupId, 'episodic');

          updated = true;
          break;
        }

        case 'read': {
          const results = retriever.retrieve(content, groupId, 5);
          for (const r of results) {
            entries.push(r.content);
            found = true;
          }

          if (!found) {
            const episodicContent = await episodic.read(groupId);
            if (episodicContent) {
              entries.push(episodicContent);
              found = true;
            }
          }
          break;
        }
      }
    } catch (err) {
      entries.push(`Memory error: ${err instanceof Error ? err.message : String(err)}`);
    }

    const output = encode('memory_result', {
      operation: op,
      found,
      entries,
      updated,
    } as Record<string, unknown>);

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
