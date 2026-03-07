import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { encode } from '../core/toon-serializer.js';
import { getConfig } from '../core/config-loader.js';
import { RollbackManager } from '../execution/rollback.js';
import { Sandbox } from '../execution/sandbox.js';
import type { AgentTask, AgentResult, IAgent } from './types.js';
import { AgentTaskSchema } from './types.js';

type OpType = 'file_write' | 'file_read' | 'code_exec' | 'pkg_install' | 'dir_list' | 'command';

const FILE_WRITE_PATTERNS = [
  /\b(?:create|write|make|generate|save)\b.*\b(?:file|page|document|script|html|css|js|py)\b/i,
  /\bcreate\s+(?:a\s+)?(?:new\s+)?(?:file|page|website|script)\b/i,
];

const FILE_READ_PATTERNS = [
  /\b(?:read|show|display|cat|print|open)\b.*\bfile\b/i,
  /\bread\s+(?:the\s+)?(?:contents?\s+of\s+)?/i,
];

const CODE_EXEC_PATTERNS = [
  /\b(?:run|execute)\b.*\b(?:code|script|program|python|node|bash)\b/i,
  /\brun\s+(?:it|this|the\s+(?:code|script))\b/i,
  /\b(?:and\s+)?run\s+it\b/i,
];

const PKG_INSTALL_PATTERNS = [
  /\b(?:install|add)\b.*\b(?:package|module|library|dependency)\b/i,
  /\bnpm\s+install\b/i,
  /\bpip\s+install\b/i,
];

const DIR_LIST_PATTERNS = [
  /\b(?:list|show|ls)\b.*\b(?:dir|directory|files|folder)\b/i,
];

function detectOp(brief: string): OpType {
  if (FILE_WRITE_PATTERNS.some(p => p.test(brief))) return 'file_write';
  if (CODE_EXEC_PATTERNS.some(p => p.test(brief))) return 'code_exec';
  if (FILE_READ_PATTERNS.some(p => p.test(brief))) return 'file_read';
  if (PKG_INSTALL_PATTERNS.some(p => p.test(brief))) return 'pkg_install';
  if (DIR_LIST_PATTERNS.some(p => p.test(brief))) return 'dir_list';
  return 'command';
}

function extractFilename(brief: string): string {
  const namePatterns = [
    /called\s+(\S+)/i,
    /named\s+(\S+)/i,
    /file\s+(\S+\.\w+)/i,
    /create\s+(\S+\.\w+)/i,
    /write\s+(?:to\s+)?(\S+\.\w+)/i,
    /save\s+(?:as|to)\s+(\S+)/i,
  ];
  for (const pattern of namePatterns) {
    const match = pattern.exec(brief);
    if (match?.[1]) return match[1];
  }
  return 'output.txt';
}

function extractCodeBlock(brief: string): { lang: string; code: string } | null {
  const blockMatch = /```(\w*)\n([\s\S]*?)```/.exec(brief);
  if (blockMatch) {
    return { lang: blockMatch[1] || 'text', code: blockMatch[2] ?? '' };
  }
  return null;
}

function detectLanguage(brief: string): string {
  const lower = brief.toLowerCase();
  if (lower.includes('python') || lower.includes('.py')) return 'python';
  if (lower.includes('node') || lower.includes('javascript') || lower.includes('.js')) return 'node';
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('.sh')) return 'bash';
  return 'node';
}

function extractContentFromBrief(brief: string): string {
  const codeBlock = extractCodeBlock(brief);
  if (codeBlock) return codeBlock.code;

  const contentMatch = /(?:with|containing|content[:\s]+)([\s\S]+)/i.exec(brief);
  if (contentMatch?.[1]) return contentMatch[1].trim();

  return '';
}

function extractPackageName(brief: string): { manager: string; pkg: string } {
  const npmMatch = /npm\s+install\s+(\S+)/i.exec(brief);
  if (npmMatch?.[1]) return { manager: 'npm', pkg: npmMatch[1] };

  const pipMatch = /pip\s+install\s+(\S+)/i.exec(brief);
  if (pipMatch?.[1]) return { manager: 'pip', pkg: pipMatch[1] };

  const pkgMatch = /install\s+(\S+)/i.exec(brief);
  if (pkgMatch?.[1]) {
    const name = pkgMatch[1];
    const isPython = brief.toLowerCase().includes('python') || brief.toLowerCase().includes('pip');
    return { manager: isPython ? 'pip' : 'npm', pkg: name };
  }

  return { manager: 'npm', pkg: '' };
}

export class ExecutionAgent implements IAgent {
  readonly type = 'execution' as const;
  private readonly rollback: RollbackManager;
  private readonly sandbox: Sandbox;

  constructor() {
    this.rollback = new RollbackManager();
    const config = getConfig();
    this.sandbox = new Sandbox({
      preferredRuntime: config.executionMode === 'isolated' ? 'docker' : 'none',
      allowDirectExec: config.executionMode === 'full_control',
    });
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const validated = AgentTaskSchema.parse(task);
    const start = performance.now();
    const brief = validated.brief;
    const op = detectOp(brief);

    let command = '';
    let exitCode = 0;
    let stdout = '';
    let stderr = '';
    const filesCreated: string[] = [];

    try {
      switch (op) {
        case 'file_write': {
          const filename = extractFilename(brief);
          const content = extractContentFromBrief(brief);
          const filePath = path.resolve(filename);

          await this.rollback.withRollback(async () => {
            const dir = path.dirname(filePath);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, content, 'utf-8');
          }, [filePath]);

          command = `write ${filename}`;
          stdout = `Created ${filename} (${content.length} bytes)`;
          filesCreated.push(filename);
          break;
        }

        case 'file_read': {
          const filename = extractFilename(brief);
          const filePath = path.resolve(filename);
          if (!fs.existsSync(filePath)) {
            exitCode = 1;
            stderr = `File not found: ${filename}`;
          } else {
            stdout = fs.readFileSync(filePath, 'utf-8');
            command = `read ${filename}`;
          }
          break;
        }

        case 'code_exec': {
          const codeBlock = extractCodeBlock(brief);
          const lang = codeBlock?.lang || detectLanguage(brief);
          const code = codeBlock?.code || extractContentFromBrief(brief);
          const ext = lang === 'python' ? '.py' : lang === 'bash' ? '.sh' : '.js';
          const tmpFile = path.join(process.cwd(), `_microclaw_tmp${ext}`);

          fs.writeFileSync(tmpFile, code, 'utf-8');
          filesCreated.push(tmpFile);

          const config = getConfig();
          if (config.executionMode === 'isolated') {
            try {
              const result = await this.sandbox.exec(
                `${lang === 'python' ? 'python3' : lang === 'bash' ? 'bash' : 'node'} ${tmpFile}`,
              );
              stdout = result.stdout;
              stderr = result.stderr;
              exitCode = result.exitCode;
            } catch {
              const runner = lang === 'python' ? 'python3' : lang === 'bash' ? 'bash' : 'node';
              const result = spawnSync(runner, [tmpFile], {
                timeout: 30_000,
                encoding: 'utf-8',
                cwd: process.cwd(),
              });
              stdout = result.stdout ?? '';
              stderr = result.stderr ?? '';
              exitCode = result.status ?? 1;
            }
          } else {
            const runner = lang === 'python' ? 'python3' : lang === 'bash' ? 'bash' : 'node';
            const result = spawnSync(runner, [tmpFile], {
              timeout: 30_000,
              encoding: 'utf-8',
              cwd: process.cwd(),
            });
            stdout = result.stdout ?? '';
            stderr = result.stderr ?? '';
            exitCode = result.status ?? 1;
          }

          command = `${lang} ${tmpFile}`;
          try { fs.unlinkSync(tmpFile); } catch { /* already cleaned up */ }
          break;
        }

        case 'pkg_install': {
          const { manager, pkg } = extractPackageName(brief);
          if (!pkg) {
            exitCode = 1;
            stderr = 'Could not determine package name';
            break;
          }
          const args = manager === 'npm' ? ['install', pkg] : ['install', pkg];
          const result = spawnSync(manager === 'npm' ? 'npm' : 'pip3', args, {
            timeout: 120_000,
            encoding: 'utf-8',
            cwd: process.cwd(),
          });
          stdout = result.stdout ?? '';
          stderr = result.stderr ?? '';
          exitCode = result.status ?? 1;
          command = `${manager} install ${pkg}`;
          break;
        }

        case 'dir_list': {
          const dirMatch = /(?:list|show|ls)\s+(\S+)/i.exec(brief);
          const targetDir = dirMatch?.[1] ?? '.';
          const resolved = path.resolve(targetDir);
          if (!fs.existsSync(resolved)) {
            exitCode = 1;
            stderr = `Directory not found: ${targetDir}`;
          } else {
            const entries = fs.readdirSync(resolved, { withFileTypes: true });
            stdout = entries
              .map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
              .join('\n');
            command = `ls ${targetDir}`;
          }
          break;
        }

        case 'command': {
          const cmdMatch = /(?:run|execute)\s+[`"']?(.*?)[`"']?\s*$/i.exec(brief);
          const cmd = cmdMatch?.[1] ?? brief;
          const config = getConfig();
          if (config.executionMode === 'isolated') {
            try {
              const result = await this.sandbox.exec(cmd);
              stdout = result.stdout;
              stderr = result.stderr;
              exitCode = result.exitCode;
            } catch {
              const result = spawnSync('sh', ['-c', cmd], {
                timeout: 30_000,
                encoding: 'utf-8',
                cwd: process.cwd(),
              });
              stdout = result.stdout ?? '';
              stderr = result.stderr ?? '';
              exitCode = result.status ?? 1;
            }
          } else {
            const result = spawnSync('sh', ['-c', cmd], {
              timeout: 30_000,
              encoding: 'utf-8',
              cwd: process.cwd(),
            });
            stdout = result.stdout ?? '';
            stderr = result.stderr ?? '';
            exitCode = result.status ?? 1;
          }
          command = cmd;
          break;
        }
      }
    } catch (err) {
      exitCode = 1;
      stderr = err instanceof Error ? err.message : String(err);
    }

    const output = encode('exec_result', {
      command,
      exitCode,
      stdout,
      stderr,
      filesCreated,
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
