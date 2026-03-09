import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface ManagedProcess {
  id:           string;
  cmd:          string;
  groupId:      string;
  status:       'running' | 'done' | 'failed' | 'killed' | 'stuck';
  startedAt:    number;
  endedAt?:     number;
  exitCode:     number | null;
  output:       string;       // rolling last ~10 KB
  lastOutputAt: number;
}

export type ResultCallback = (groupId: string, processId: string, result: string) => void;

const OUTPUT_CAP   = 10_000;  // chars kept per process
const STUCK_MS     = 60_000;  // 60s no output → warn as stuck
const RETAIN_AFTER = 120_000; // keep finished processes 2 min for queries

class ProcessManager {
  private readonly procs = new Map<string, ManagedProcess & { child: ReturnType<typeof spawn> }>();
  private onResult: ResultCallback | null = null;
  private ticker: NodeJS.Timeout | null = null;

  /** Wire the callback that sends results to the user. Call once at daemon startup. */
  init(callback: ResultCallback): void {
    this.onResult = callback;
    this.ticker = setInterval(() => this.tick(), 15_000);
  }

  /** Launch a command in the background. Returns the process ID immediately. */
  launch(cmd: string, cwd: string, groupId: string): string {
    const id     = `proc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const shell  = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    const absCwd = path.isAbsolute(cwd) ? cwd : path.resolve(cwd);

    const child = spawn(shell, ['-c', cmd], {
      cwd: absCwd,
      env: process.env,
      detached: false,
    } as Parameters<typeof spawn>[2]);

    const proc: ManagedProcess & { child: ReturnType<typeof spawn> } = {
      id, cmd, groupId,
      status:       'running',
      startedAt:    Date.now(),
      exitCode:     null,
      output:       '',
      lastOutputAt: Date.now(),
      child,
    };
    this.procs.set(id, proc);

    const addOutput = (d: Buffer | string) => {
      proc.output += d.toString();
      proc.lastOutputAt = Date.now();
      if (proc.output.length > OUTPUT_CAP) {
        proc.output = '[…truncated…]\n' + proc.output.slice(-8_000);
      }
    };
    child.stdout?.on('data', addOutput);
    child.stderr?.on('data', addOutput);

    child.on('close', (code) => {
      proc.status   = code === 0 ? 'done' : 'failed';
      proc.exitCode = code;
      proc.endedAt  = Date.now();
      const elapsed = ((proc.endedAt - proc.startedAt) / 1000).toFixed(1);
      const icon    = proc.status === 'done' ? '✓' : '✗';
      const result  = [
        `${icon} Background process ${id} ${proc.status} (${elapsed}s)`,
        `Command: ${cmd}`,
        `Exit: ${code ?? -1}`,
        proc.output.trim() ? `Output:\n${proc.output.trim()}` : '(no output)',
      ].join('\n');
      this.onResult?.(groupId, id, result);
    });

    child.on('error', (err) => {
      proc.status  = 'failed';
      proc.endedAt = Date.now();
      this.onResult?.(groupId, id, `✗ Process ${id} failed to start\nCmd: ${cmd}\nError: ${err.message}`);
    });

    return id;
  }

  /** Kill a process by ID. */
  kill(id: string): string {
    const proc = this.procs.get(id);
    if (!proc)                                       return `No process with id ${id}`;
    if (proc.status !== 'running' && proc.status !== 'stuck') return `Process ${id} is already ${proc.status}`;
    proc.child.kill('SIGKILL');
    proc.status  = 'killed';
    proc.endedAt = Date.now();
    return `Killed: ${id}`;
  }

  /** List processes, optionally filtered by group. */
  list(groupId?: string): string {
    const all = [...this.procs.values()].filter(p => !groupId || p.groupId === groupId);
    if (!all.length) return 'No background processes.';
    return all.map(p => {
      const age    = p.endedAt
        ? `${((p.endedAt - p.startedAt) / 1000).toFixed(1)}s`
        : `${((Date.now() - p.startedAt) / 1000).toFixed(0)}s running`;
      return `[${p.id}] ${p.status.toUpperCase()} ${age}\n  $ ${p.cmd.slice(0, 80)}`;
    }).join('\n');
  }

  /** Get the current output (last ~10 KB) of a process. */
  output(id: string): string {
    const proc = this.procs.get(id);
    if (!proc) return `No process with id ${id}`;
    return [
      `Process ${id} — ${proc.status}`,
      `Command: ${proc.cmd}`,
      proc.output.trim() || '(no output yet)',
    ].join('\n');
  }

  /** Status of a single process. */
  status(id: string): string {
    const proc = this.procs.get(id);
    if (!proc) return `No process with id ${id}`;
    const elapsed = ((Date.now() - proc.startedAt) / 1000).toFixed(0);
    const end     = proc.endedAt ? ` | ended after ${((proc.endedAt - proc.startedAt) / 1000).toFixed(1)}s` : ` | running ${elapsed}s`;
    return `${proc.id}  status=${proc.status}  exit=${proc.exitCode ?? 'n/a'}${end}\n$ ${proc.cmd}`;
  }

  stop(): void {
    if (this.ticker) clearInterval(this.ticker);
  }

  private tick(): void {
    const now = Date.now();
    for (const proc of this.procs.values()) {
      // Warn about stuck processes
      if (proc.status === 'running' && now - proc.lastOutputAt > STUCK_MS) {
        proc.status = 'stuck';
        const secs  = Math.round(STUCK_MS / 1000);
        this.onResult?.(proc.groupId, proc.id, [
          `⚠ Process ${proc.id} appears stuck (no output for ${secs}s)`,
          `Command: ${proc.cmd}`,
          `To kill it: tell me "stop process ${proc.id}"`,
        ].join('\n'));
      }
      // Evict old finished processes
      if (proc.endedAt && now - proc.endedAt > RETAIN_AFTER) {
        this.procs.delete(proc.id);
      }
    }
  }
}

export const processManager = new ProcessManager();
