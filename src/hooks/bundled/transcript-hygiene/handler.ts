import type { ToolResultHookHandler } from '../../types.js';

const PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,
  /AIza[A-Za-z0-9_-]{35}/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /(password|secret|token|key)\s*[:=]\s*\S+/gi,
];

export const toolResultHook: ToolResultHookHandler = (event) => {
  if (event.type !== 'tool_result') return undefined;
  let result = typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
  let redacted = false;
  for (const p of PATTERNS) {
    p.lastIndex = 0;
    if (p.test(result)) {
      p.lastIndex = 0;
      result = result.replace(p, '[REDACTED]');
      redacted = true;
    }
  }
  return redacted ? result : undefined;
};
