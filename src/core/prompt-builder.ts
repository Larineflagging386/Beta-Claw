import fs from 'node:fs';
import path from 'node:path';
import { estimateTokens } from './token-budget.js';
import type { SkillDefinition } from './skill-parser.js';
import type { MicroClawDB } from '../db.js';
import { GROUPS_DIR, MEMORY_FILENAME, SOUL_FILENAME } from './paths.js';

const AGENT_BASE_PATH = path.resolve('prompts/system/agent-base.toon');

/** Compact tool list — full tool definitions are passed separately via the tools array. */
const TOOL_SUMMARY =
  'FS: read write append delete list search | ' +
  'Sys: exec python node process | ' +
  'Web: web_search web_fetch download | ' +
  'Browser: browser | ' +
  'Mem: memory_read memory_write memory_search | ' +
  'Auto: cron scheduler heartbeat | ' +
  'Agent: session context history | ' +
  'Cfg: config env logs';

function loadAgentBase(personaName: string, personaStyle: string): string {
  try {
    if (fs.existsSync(AGENT_BASE_PATH)) {
      return fs.readFileSync(AGENT_BASE_PATH, 'utf-8')
        .replace(/\{\{PERSONA_NAME\}\}/g, personaName)
        .replace(/\{\{PERSONA_STYLE\}\}/g, personaStyle);
    }
  } catch {
    // fall through to inline fallback
  }
  return `You are ${personaName} (${personaStyle}). Use tools — never say you cannot do something a tool can do.
Tools: ${TOOL_SUMMARY}
All files go to .workspace/ unless a path is specified. CWD: ${process.cwd()}`;
}

function extractSoulMeta(soul: string): { name: string; style: string } {
  const nameMatch = soul.match(/^#\s*Identity\s*\nYou are ([^.\n]+)/m);
  const styleMatch = soul.match(/^#\s*Style\s*\n([^\n]+)/m);
  return {
    name: nameMatch?.[1]?.trim() ?? 'Andy',
    style: styleMatch?.[1]?.trim() ?? 'direct and concise',
  };
}

/**
 * Retrieve the most relevant memory chunks via FTS5.
 * Falls back to the last 5 facts by recency if no hint is available.
 */
function selectiveMemory(db: MicroClawDB | undefined, groupId: string, memoryPath: string, hint?: string): string {
  // Always try FTS5 first if db is available
  if (db) {
    try {
      const safe = (hint ?? '').replace(/["*(){}:^~.\-/\\]/g, ' ').trim();
      if (safe) {
        const rows = db.searchMemory(safe, groupId, 5);
        if (rows.length) return rows.map(r => `- ${r.content}`).join('\n');
      }
      // Fallback: last 5 stored facts by recency
      const recent = db.searchMemory('', groupId, 5);
      if (recent.length) return recent.map(r => `- ${r.content}`).join('\n');
    } catch { /* ignore if FTS unavailable */ }
  }

  // Final fallback: read first 30 lines of memory file
  if (!fs.existsSync(memoryPath)) return '';
  const lines = fs.readFileSync(memoryPath, 'utf-8').split('\n');
  return lines.slice(0, 30).join('\n').trim();
}

export async function buildSystemPrompt(
  groupId: string,
  skills?: SkillDefinition[],
  context?: { senderId?: string; channel?: string },
  db?: MicroClawDB,
  lastUserMessage?: string,
): Promise<string> {
  const soulPath = path.join(GROUPS_DIR, groupId, SOUL_FILENAME);
  const memoryPath = path.join(GROUPS_DIR, groupId, MEMORY_FILENAME);

  const soul = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf-8').trim() : '';
  const memory = selectiveMemory(db, groupId, memoryPath, lastUserMessage);

  const { name: personaName, style: personaStyle } = extractSoulMeta(soul);
  const agentBase = loadAgentBase(personaName, personaStyle);

  const parts: string[] = [];

  // 1. Agent base (compact: ~50 tokens)
  parts.push(agentBase);

  // 2. Persona / SOUL
  if (soul) parts.push(`--- Persona ---\n${soul}`);

  // 3. Available skills
  if (skills && skills.length > 0) {
    const skillList = skills.map(s => `/${s.command}: ${s.description}`).join('\n');
    parts.push(`--- Skills ---\n${skillList}`);
  }

  // 4. Relevant memory (selective injection — ~5 chunks, not full file)
  if (memory) parts.push(`--- Memory ---\n${memory}`);

  // 5. Runtime context
  const ctxLines = [`CWD: ${process.cwd()}`];
  if (context?.channel)  ctxLines.push(`Channel: ${context.channel}`);
  if (context?.senderId) ctxLines.push(`Sender: ${context.senderId}`);
  parts.push(`--- Context ---\n${ctxLines.join('\n')}`);

  return parts.join('\n\n');
}

/** Estimate token count for a built system prompt (for benchmarking). */
export function estimateSystemPromptTokens(prompt: string): number {
  return estimateTokens(prompt);
}
