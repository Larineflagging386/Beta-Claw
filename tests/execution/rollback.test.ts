import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RollbackManager, ManifestSchema } from '../../src/execution/rollback.js';
import { betaclawDB } from '../../src/db.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-test-'));
}

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-db-test-'));
  return path.join(dir, 'test.db');
}

describe('RollbackManager', () => {
  let testDir: string;
  let snapshotsDir: string;
  let manager: RollbackManager;

  beforeEach(() => {
    testDir = tmpDir();
    snapshotsDir = path.join(testDir, 'snapshots');
    manager = new RollbackManager(snapshotsDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('creates snapshot directory and blobs directory on construction', () => {
    expect(fs.existsSync(snapshotsDir)).toBe(true);
    expect(fs.existsSync(path.join(snapshotsDir, 'blobs'))).toBe(true);
  });

  it('creates snapshot of existing files and returns an ID', async () => {
    const filePath = path.join(testDir, 'hello.txt');
    fs.writeFileSync(filePath, 'hello world');

    const id = await manager.createSnapshot([filePath]);

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const snapshots = manager.listSnapshots();
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]!.id).toBe(id);
    expect(snapshots[0]!.paths).toContain(path.resolve(filePath));
  });

  it('restores snapshot to original file content', async () => {
    const filePath = path.join(testDir, 'data.txt');
    fs.writeFileSync(filePath, 'original content');

    const snapshotId = await manager.createSnapshot([filePath]);

    fs.writeFileSync(filePath, 'modified content');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('modified content');

    await manager.restoreSnapshot(snapshotId);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original content');
  });

  it('withRollback succeeds — returns result, no rollback', async () => {
    const filePath = path.join(testDir, 'success.txt');
    fs.writeFileSync(filePath, 'before');

    const result = await manager.withRollback(
      async () => {
        fs.writeFileSync(filePath, 'after');
        return 42;
      },
      [filePath],
    );

    expect(result).toBe(42);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('after');
  });

  it('withRollback fails — restores files and re-throws error', async () => {
    const filePath = path.join(testDir, 'fail.txt');
    fs.writeFileSync(filePath, 'original');

    await expect(
      manager.withRollback(
        async () => {
          fs.writeFileSync(filePath, 'corrupted');
          throw new Error('operation failed');
        },
        [filePath],
      ),
    ).rejects.toThrow('operation failed');

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');
  });

  it('content-addressed dedup: identical content produces one blob', async () => {
    const file1 = path.join(testDir, 'dup1.txt');
    const file2 = path.join(testDir, 'dup2.txt');
    const content = 'identical content for dedup test';
    fs.writeFileSync(file1, content);
    fs.writeFileSync(file2, content);

    await manager.createSnapshot([file1, file2]);

    const blobsDir = path.join(snapshotsDir, 'blobs');
    const blobs = fs.readdirSync(blobsDir);
    expect(blobs.length).toBe(1);

    const expectedHash = createHash('sha256').update(Buffer.from(content)).digest('hex');
    expect(blobs[0]).toBe(`${expectedHash}.blob`);
  });

  it('listSnapshots returns all snapshots sorted by timestamp descending', async () => {
    const filePath = path.join(testDir, 'list.txt');
    fs.writeFileSync(filePath, 'v1');

    const id1 = await manager.createSnapshot([filePath]);
    const id2 = await manager.createSnapshot([filePath]);
    const id3 = await manager.createSnapshot([filePath]);

    const snapshots = manager.listSnapshots();
    expect(snapshots.length).toBe(3);

    const ids = snapshots.map((s) => s.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(ids).toContain(id3);

    for (let i = 0; i < snapshots.length - 1; i++) {
      expect(snapshots[i]!.timestamp).toBeGreaterThanOrEqual(snapshots[i + 1]!.timestamp);
    }
  });

  it('prune removes excess snapshots beyond max', async () => {
    const filePath = path.join(testDir, 'prune.txt');
    fs.writeFileSync(filePath, 'data');

    for (let i = 0; i < 5; i++) {
      await manager.createSnapshot([filePath]);
    }

    expect(manager.listSnapshots().length).toBe(5);

    const pruned = manager.prune(3);
    expect(pruned).toBe(2);
    expect(manager.listSnapshots().length).toBe(3);
  });

  it('snapshot of non-existent file records absence', async () => {
    const missingPath = path.join(testDir, 'does-not-exist.txt');

    const snapshotId = await manager.createSnapshot([missingPath]);

    const snapshots = manager.listSnapshots();
    expect(snapshots.length).toBe(1);

    const dirEntries = fs.readdirSync(snapshotsDir, { withFileTypes: true });
    const snapshotDirEntry = dirEntries.find(
      (e) => e.isDirectory() && e.name !== 'blobs',
    );
    expect(snapshotDirEntry).toBeDefined();

    const manifestRaw = fs.readFileSync(
      path.join(snapshotsDir, snapshotDirEntry!.name, 'manifest.json'),
      'utf-8',
    );
    const manifest = ManifestSchema.parse(JSON.parse(manifestRaw));
    expect(manifest.id).toBe(snapshotId);

    const resolved = path.resolve(missingPath);
    const entry = manifest.entries[resolved];
    expect(entry).toBeDefined();
    expect(entry!.exists).toBe(false);
    expect(entry!.hash).toBeNull();
  });

  it('restoring non-existent-file snapshot removes file if created after', async () => {
    const filePath = path.join(testDir, 'later.txt');

    const snapshotId = await manager.createSnapshot([filePath]);
    expect(fs.existsSync(filePath)).toBe(false);

    fs.writeFileSync(filePath, 'created after snapshot');
    expect(fs.existsSync(filePath)).toBe(true);

    await manager.restoreSnapshot(snapshotId);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('handles multiple files in a single snapshot', async () => {
    const files = [
      path.join(testDir, 'a.txt'),
      path.join(testDir, 'b.txt'),
      path.join(testDir, 'c.txt'),
    ];
    fs.writeFileSync(files[0]!, 'aaa');
    fs.writeFileSync(files[1]!, 'bbb');
    fs.writeFileSync(files[2]!, 'ccc');

    const snapshotId = await manager.createSnapshot(files);

    fs.writeFileSync(files[0]!, 'modified-a');
    fs.writeFileSync(files[1]!, 'modified-b');
    fs.unlinkSync(files[2]!);

    await manager.restoreSnapshot(snapshotId);

    expect(fs.readFileSync(files[0]!, 'utf-8')).toBe('aaa');
    expect(fs.readFileSync(files[1]!, 'utf-8')).toBe('bbb');
    expect(fs.readFileSync(files[2]!, 'utf-8')).toBe('ccc');
  });

  it('creates snapshot directory with YYYYMMDD-HHMMSS format', async () => {
    const filePath = path.join(testDir, 'fmt.txt');
    fs.writeFileSync(filePath, 'format test');

    await manager.createSnapshot([filePath]);

    const dirEntries = fs.readdirSync(snapshotsDir, { withFileTypes: true });
    const snapshotDirs = dirEntries
      .filter((e) => e.isDirectory() && e.name !== 'blobs')
      .map((e) => e.name);

    expect(snapshotDirs.length).toBe(1);
    expect(snapshotDirs[0]).toMatch(/^\d{8}-\d{6}$/);
  });

  it('records snapshot metadata in DB when provided', async () => {
    const dbPath = tmpDbPath();
    const db = new betaclawDB(dbPath);

    try {
      const dbManager = new RollbackManager(
        path.join(testDir, 'db-snapshots'),
        db,
      );

      const filePath = path.join(testDir, 'dbfile.txt');
      fs.writeFileSync(filePath, 'db content');

      const snapshotId = await dbManager.createSnapshot([filePath]);

      const rows = db.getSnapshots();
      expect(rows.length).toBe(1);
      expect(rows[0]!.id).toBe(snapshotId);
    } finally {
      db.close();
      fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
    }
  });
});
