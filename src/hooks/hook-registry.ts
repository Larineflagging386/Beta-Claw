import fs from 'fs';
import path from 'path';
import { PATHS } from '../core/paths.js';
import type { RegisteredHook, HookHandler, HookEvent, ToolResultHookHandler, ToolResultEvent } from './types.js';

export class HookRegistry {
  private hooks           = new Map<string, RegisteredHook & { handler: HookHandler }>();
  private toolResultHooks : ToolResultHookHandler[] = [];
  private enabledIds      = new Set<string>();

  async load(): Promise<void> {
    const sources: Array<{ dir: string; source: RegisteredHook['source'] }> = [
      { dir: path.join(process.cwd(), 'src/hooks/bundled'), source: 'bundled' },
      { dir: path.resolve(PATHS.hooks),                     source: 'managed' },
    ];

    for (const { dir, source } of sources) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) await this.loadOne(path.join(dir, entry.name), source);
      }
    }

    if (fs.existsSync(PATHS.groups)) {
      for (const group of fs.readdirSync(PATHS.groups, { withFileTypes: true })) {
        if (!group.isDirectory()) continue;
        const hooksDir = path.join(PATHS.groups, group.name, 'hooks');
        if (!fs.existsSync(hooksDir)) continue;
        for (const entry of fs.readdirSync(hooksDir, { withFileTypes: true })) {
          if (entry.isDirectory()) await this.loadOne(path.join(hooksDir, entry.name), 'workspace');
        }
      }
    }

    for (const [id, hook] of this.hooks) {
      if (hook.source === 'bundled') this.enabledIds.add(id);
    }

    console.log(`[hooks] ${this.hooks.size} loaded, ${this.enabledIds.size} enabled`);
  }

  private async loadOne(hookDir: string, source: RegisteredHook['source']): Promise<void> {
    const mdPath = path.join(hookDir, 'HOOK.md');
    const tsPath = path.join(hookDir, 'handler.ts');
    if (!fs.existsSync(mdPath) || !fs.existsSync(tsPath)) return;

    const meta = parseMeta(fs.readFileSync(mdPath, 'utf-8'));
    if (!meta) return;

    try {
      const mod = await import(tsPath) as { default?: HookHandler; toolResultHook?: ToolResultHookHandler };
      if (mod.toolResultHook) this.toolResultHooks.push(mod.toolResultHook);
      if (mod.default) {
        this.hooks.set(meta.id, { ...meta, source, enabled: false, handlerPath: tsPath, handler: mod.default });
      }
    } catch (e) {
      console.warn(`[hooks] Failed to load ${hookDir}:`, e);
    }
  }

  enable(id: string):  void { this.enabledIds.add(id); }
  disable(id: string): void { this.enabledIds.delete(id); }

  list(): RegisteredHook[] {
    return [...this.hooks.values()].map(h => ({ ...h, enabled: this.enabledIds.has(h.id) }));
  }

  async fire(event: HookEvent): Promise<string[]> {
    const messages: string[] = [];
    event.messages = messages;
    for (const [id, hook] of this.hooks) {
      if (!this.enabledIds.has(id)) continue;
      if (!hook.events.some(e => matches(e, event))) continue;
      try { await hook.handler(event); }
      catch (e) { console.error(`[hooks] ${id} threw:`, e); }
    }
    return messages;
  }

  applyToolResult(event: ToolResultEvent): unknown {
    let result = event.result;
    for (const hook of this.toolResultHooks) {
      try {
        const mod = hook({ ...event, result });
        if (mod !== undefined) result = mod;
      } catch (e) { console.error('[hooks] tool_result hook threw:', e); }
    }
    return result;
  }
}

function matches(pattern: string, event: HookEvent): boolean {
  return pattern === event.type || pattern === `${event.type}:${event.action}`;
}

function parseMeta(content: string): Omit<RegisteredHook, 'source' | 'enabled' | 'handlerPath' | 'handler'> | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  try {
    const lines = fm[1]!.split('\n');
    const get = (k: string) => lines.find(l => l.startsWith(`${k}:`))?.split(':').slice(1).join(':').trim() ?? '';
    const name = get('name');
    if (!name) return null;
    const description = get('description').replace(/^"|"$/g, '');
    const metaBlock   = content.match(/"openclaw":\s*\{([^}]+)\}/)?.[1] ?? '';
    const emoji       = metaBlock.match(/"emoji":\s*"([^"]+)"/)?.[1] ?? '🔧';
    const evRaw       = metaBlock.match(/"events":\s*\[([^\]]+)\]/)?.[1] ?? '';
    const events      = evRaw ? evRaw.split(',').map(s => s.trim().replace(/"/g, '')) : [];
    return { id: name, name, description, emoji, events };
  } catch { return null; }
}

export const hookRegistry = new HookRegistry();
