import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { decode } from '../core/toon-serializer.js';

const GroupIdSchema = z.string().min(1);
const GroupConfigSchema = z.record(z.string(), z.unknown());

class EpisodicMemory {
  private readonly groupsDir: string;

  constructor(groupsDir?: string) {
    this.groupsDir = groupsDir ?? 'groups';
  }

  async read(groupId: string): Promise<string> {
    const filePath = this.resolvePath(groupId);
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  async write(groupId: string, content: string): Promise<void> {
    const filePath = this.resolvePath(groupId);
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmpPath = filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
  }

  async update(groupId: string, section: string, content: string): Promise<void> {
    const existing = await this.read(groupId);
    const sectionHeader = `## ${section}`;

    if (!existing) {
      await this.write(groupId, `${sectionHeader}\n${content}\n`);
      return;
    }

    const lines = existing.split('\n');
    const sectionIdx = lines.findIndex(l => l.trimEnd() === sectionHeader);

    if (sectionIdx === -1) {
      await this.write(groupId, `${existing.trimEnd()}\n\n${sectionHeader}\n${content}\n`);
      return;
    }

    let endIdx = lines.length;
    for (let i = sectionIdx + 1; i < lines.length; i++) {
      if (lines[i]!.startsWith('## ')) {
        endIdx = i;
        break;
      }
    }

    const before = lines.slice(0, sectionIdx);
    const after = lines.slice(endIdx);
    const newLines = [...before, sectionHeader, content, ...after];
    await this.write(groupId, newLines.join('\n'));
  }

  exists(groupId: string): boolean {
    return fs.existsSync(this.resolvePath(groupId));
  }

  async getGroupConfig(groupId: string): Promise<Record<string, unknown> | null> {
    const content = await this.read(groupId);
    if (!content) return null;

    const configText = this.extractConfigSection(content);
    if (!configText) return null;

    try {
      const parsed = decode(configText);
      return GroupConfigSchema.parse(parsed.data);
    } catch {
      return null;
    }
  }

  private extractConfigSection(content: string): string | null {
    const lines = content.split('\n');
    let inConfig = false;
    const configLines: string[] = [];

    for (const line of lines) {
      if (line.trimEnd() === '## MicroClaw Config') {
        inConfig = true;
        continue;
      }
      if (inConfig && line.startsWith('## ')) {
        break;
      }
      if (inConfig) {
        configLines.push(line);
      }
    }

    const text = configLines.join('\n').trim();
    return text || null;
  }

  private resolvePath(groupId: string): string {
    const validated = GroupIdSchema.parse(groupId);
    return path.join(this.groupsDir, validated, 'CLAUDE.md');
  }
}

export { EpisodicMemory };
