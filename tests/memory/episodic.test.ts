import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EpisodicMemory } from '../../src/memory/episodic.js';

describe('EpisodicMemory', () => {
  let tmpDir: string;
  let memory: EpisodicMemory;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'episodic-test-'));
    memory = new EpisodicMemory(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads CLAUDE.md content', async () => {
    const content = '# Group: Test\n\n## Memory\nSome notes here\n';
    await memory.write('group-1', content);
    const result = await memory.read('group-1');
    expect(result).toBe(content);
  });

  it('returns empty string when reading non-existent group', async () => {
    const result = await memory.read('nonexistent');
    expect(result).toBe('');
  });

  it('creates directory structure if missing', async () => {
    await memory.write('new-group', '# Test content\n');

    const dirPath = path.join(tmpDir, 'new-group');
    expect(fs.existsSync(dirPath)).toBe(true);

    const filePath = path.join(dirPath, 'CLAUDE.md');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('performs atomic write with no leftover .tmp file', async () => {
    await memory.write('group-1', 'test content');

    const tmpPath = path.join(tmpDir, 'group-1', 'CLAUDE.md.tmp');
    expect(fs.existsSync(tmpPath)).toBe(false);

    const filePath = path.join(tmpDir, 'group-1', 'CLAUDE.md');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('test content');
  });

  it('updates existing section in CLAUDE.md', async () => {
    const initial = '# Group: Test\n\n## Memory\nOld notes\n\n## Other\nStuff\n';
    await memory.write('group-1', initial);

    await memory.update('group-1', 'Memory', 'New notes');

    const result = await memory.read('group-1');
    expect(result).toContain('## Memory');
    expect(result).toContain('New notes');
    expect(result).not.toContain('Old notes');
    expect(result).toContain('## Other');
    expect(result).toContain('Stuff');
  });

  it('appends new section via update when section does not exist', async () => {
    const initial = '# Group: Test\n\n## Memory\nSome notes\n';
    await memory.write('group-1', initial);

    await memory.update('group-1', 'Skills', 'Skill list here');

    const result = await memory.read('group-1');
    expect(result).toContain('## Memory');
    expect(result).toContain('Some notes');
    expect(result).toContain('## Skills');
    expect(result).toContain('Skill list here');
  });

  it('creates file with section when updating non-existent group', async () => {
    await memory.update('new-group', 'Memory', 'First note');

    const result = await memory.read('new-group');
    expect(result).toContain('## Memory');
    expect(result).toContain('First note');
  });

  it('returns true for exists when CLAUDE.md is present', async () => {
    expect(memory.exists('group-1')).toBe(false);
    await memory.write('group-1', 'content');
    expect(memory.exists('group-1')).toBe(true);
  });

  it('parses MicroClaw Config section with TOON block', async () => {
    const content = [
      '# Group: Family Chat',
      'Created: 2025-01-15',
      '',
      '## Memory',
      'Standard notes here',
      '',
      '## MicroClaw Config',
      '@group{',
      '  triggerWord:@rem',
      '  allowedTools:[brave_search, fetch_url]',
      '}',
    ].join('\n');

    await memory.write('family', content);

    const config = await memory.getGroupConfig('family');
    expect(config).not.toBeNull();
    expect(config!['triggerWord']).toBe('@re');
    expect(config!['allowedTools']).toEqual(['brave_search', 'fetch_url']);
  });

  it('handles NanoClaw-compatible plain markdown without TOON blocks', async () => {
    const content = '# Group: Simple\n\n## Memory\nJust plain notes\nNo config section\n';
    await memory.write('simple', content);

    const config = await memory.getGroupConfig('simple');
    expect(config).toBeNull();

    const text = await memory.read('simple');
    expect(text).toContain('Just plain notes');
  });

  it('returns null for getGroupConfig with invalid TOON', async () => {
    const content = '# Group: Bad\n\n## MicroClaw Config\nnot valid toon at all\n';
    await memory.write('bad', content);

    const config = await memory.getGroupConfig('bad');
    expect(config).toBeNull();
  });
});
