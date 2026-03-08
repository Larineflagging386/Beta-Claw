import type { ToolDefinition } from './tools.js';

type IntentCategory = 'file_ops' | 'exec' | 'web' | 'memory' | 'general';

const TOOL_MAP: Record<IntentCategory, string[]> = {
  file_ops: ['read', 'write', 'list'],
  exec:     ['exec'],
  web:      ['web_search', 'web_fetch'],
  memory:   ['memory_read', 'memory_write'],
  general:  ['web_search', 'read', 'exec', 'memory_read'],
};

export function classifyIntent(message: string): IntentCategory {
  const m = message.toLowerCase();
  if (/\b(file|read|write|edit|create|folder|directory|ls|cat)\b/.test(m))  return 'file_ops';
  if (/\b(run|exec|bash|shell|script|install|npm|pip|build|compile)\b/.test(m)) return 'exec';
  if (/\b(search|google|look up|current|latest|news|price|web|url|fetch)\b/.test(m)) return 'web';
  if (/\b(remember|recall|memory|forget|save|stored|preference)\b/.test(m)) return 'memory';
  return 'general';
}

export function getToolsForIntent(category: IntentCategory, allTools: ToolDefinition[]): ToolDefinition[] {
  const names = new Set(TOOL_MAP[category]);
  return allTools.filter(t => names.has(t.name));
}

export { TOOL_MAP };
export type { IntentCategory };
