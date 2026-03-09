import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { betaclawDB } from '../db.js';

const ManifestEntrySchema = z.object({
  hash: z.string().nullable(),
  exists: z.boolean(),
});

const ManifestSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  paths: z.array(z.string()),
  entries: z.record(z.string(), ManifestEntrySchema),
});

type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
type Manifest = z.infer<typeof ManifestSchema>;

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}${mo}${d}-${h}${mi}${s}`;
}

class RollbackManager {
  private readonly snapshotsDir: string;
  private readonly blobsDir: string;
  private readonly db: betaclawDB | undefined;

  constructor(snapshotsDir = '.beta/snapshots', db?: betaclawDB) {
    this.snapshotsDir = path.resolve(snapshotsDir);
    this.blobsDir = path.join(this.snapshotsDir, 'blobs');
    this.db = db;
    fs.mkdirSync(this.blobsDir, { recursive: true });
  }

  async withRollback<T>(
    operation: () => Promise<T>,
    affectedPaths: string[],
  ): Promise<T> {
    const snapshotId = await this.createSnapshot(affectedPaths);
    try {
      return await operation();
    } catch (error: unknown) {
      await this.restoreSnapshot(snapshotId);
      throw error;
    }
  }

  async createSnapshot(paths: string[]): Promise<string> {
    const now = new Date();
    const timestamp = now.getTime();
    const dirName = formatTimestamp(now);
    const id = randomUUID();

    let snapshotDir = path.join(this.snapshotsDir, dirName);
    let counter = 1;
    while (fs.existsSync(snapshotDir)) {
      snapshotDir = path.join(this.snapshotsDir, `${dirName}-${counter}`);
      counter++;
    }

    fs.mkdirSync(snapshotDir, { recursive: true });

    const entries: Record<string, ManifestEntry> = {};

    for (const filePath of paths) {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        const content = fs.readFileSync(resolved);
        const hash = sha256(content);
        const blobPath = path.join(this.blobsDir, `${hash}.blob`);
        if (!fs.existsSync(blobPath)) {
          fs.writeFileSync(blobPath, content);
        }
        entries[resolved] = { hash, exists: true };
      } else {
        entries[resolved] = { hash: null, exists: false };
      }
    }

    const manifest: Manifest = {
      id,
      timestamp,
      paths: paths.map((p) => path.resolve(p)),
      entries,
    };

    fs.writeFileSync(
      path.join(snapshotDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );

    if (this.db) {
      this.db.insertSnapshot({
        id,
        description: null,
        paths: JSON.stringify(paths),
        storage_dir: snapshotDir,
        expires_at: Math.floor(timestamp / 1000) + 30 * 24 * 60 * 60,
      });
    }

    this.prune();

    return id;
  }

  async restoreSnapshot(snapshotId: string): Promise<void> {
    const manifest = this.findManifestById(snapshotId);
    if (!manifest) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    for (const [filePath, entry] of Object.entries(manifest.entries)) {
      if (entry.exists && entry.hash) {
        const blobPath = path.join(this.blobsDir, `${entry.hash}.blob`);
        if (!fs.existsSync(blobPath)) {
          throw new Error(`Blob missing for hash: ${entry.hash}`);
        }
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(blobPath, filePath);
      } else {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }

  listSnapshots(): Array<{ id: string; timestamp: number; paths: string[] }> {
    const result: Array<{ id: string; timestamp: number; paths: string[] }> = [];

    if (!fs.existsSync(this.snapshotsDir)) {
      return result;
    }

    const dirEntries = fs.readdirSync(this.snapshotsDir, { withFileTypes: true });
    for (const dirEntry of dirEntries) {
      if (!dirEntry.isDirectory() || dirEntry.name === 'blobs') continue;
      const manifestPath = path.join(this.snapshotsDir, dirEntry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const parsed = ManifestSchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success) continue;

      result.push({
        id: parsed.data.id,
        timestamp: parsed.data.timestamp,
        paths: parsed.data.paths,
      });
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  }

  prune(maxSnapshots = 20): number {
    const snapshots = this.listSnapshots();
    if (snapshots.length <= maxSnapshots) return 0;

    const idsToRemove = new Set(snapshots.slice(maxSnapshots).map((s) => s.id));
    let pruned = 0;

    const dirEntries = fs.readdirSync(this.snapshotsDir, { withFileTypes: true });
    for (const dirEntry of dirEntries) {
      if (!dirEntry.isDirectory() || dirEntry.name === 'blobs') continue;
      const manifestPath = path.join(this.snapshotsDir, dirEntry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const parsed = ManifestSchema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success && idsToRemove.has(parsed.data.id)) {
        fs.rmSync(path.join(this.snapshotsDir, dirEntry.name), { recursive: true });
        if (this.db) {
          this.db.deleteSnapshot(parsed.data.id);
        }
        pruned++;
      }
    }

    return pruned;
  }

  private findManifestById(snapshotId: string): Manifest | undefined {
    if (!fs.existsSync(this.snapshotsDir)) return undefined;

    const dirEntries = fs.readdirSync(this.snapshotsDir, { withFileTypes: true });
    for (const dirEntry of dirEntries) {
      if (!dirEntry.isDirectory() || dirEntry.name === 'blobs') continue;
      const manifestPath = path.join(this.snapshotsDir, dirEntry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const parsed = ManifestSchema.safeParse(JSON.parse(raw) as unknown);
      if (parsed.success && parsed.data.id === snapshotId) {
        return parsed.data;
      }
    }

    return undefined;
  }
}

export { RollbackManager, ManifestSchema, ManifestEntrySchema };
export type { Manifest, ManifestEntry };
