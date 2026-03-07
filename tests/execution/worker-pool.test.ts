import { describe, it, expect } from 'vitest';
import { WorkerPool, POOL_SIZES } from '../../src/execution/worker-pool.js';

describe('WorkerPool', () => {
  it('submits a task and gets result', async () => {
    const pool = new WorkerPool(2);
    const result = await pool.submit<string>({ type: 'echo', data: 'hello' });
    expect(result).toBe('hello');
    await pool.shutdown();
  });

  it('handles multiple concurrent tasks', async () => {
    const pool = new WorkerPool(4);
    const promises = [
      pool.submit<string>({ type: 'echo', data: 'alpha' }),
      pool.submit<string>({ type: 'echo', data: 'bravo' }),
      pool.submit<string>({ type: 'echo', data: 'charlie' }),
    ];

    const results = await Promise.all(promises);
    expect(results).toEqual(['alpha', 'bravo', 'charlie']);
    await pool.shutdown();
  });

  it('reports accurate pool stats', () => {
    const pool = new WorkerPool(3);

    const s = pool.stats();
    expect(s.total).toBe(3);
    expect(s.busy).toBe(0);
    expect(s.idle).toBe(3);
    expect(s.queued).toBe(0);
  });

  it('completes shutdown gracefully', async () => {
    const pool = new WorkerPool(2);
    pool.submit({ type: 'echo', data: 'task-a' });
    pool.submit({ type: 'echo', data: 'task-b' });

    await pool.shutdown();

    await expect(
      pool.submit({ type: 'echo', data: 'after-shutdown' }),
    ).rejects.toThrow(/shut down/);
  });

  it('queues tasks when all workers are busy', () => {
    const pool = new WorkerPool(1);

    pool.submit({ type: 'echo', data: 'first' });
    pool.submit({ type: 'echo', data: 'second' });
    pool.submit({ type: 'echo', data: 'third' });

    const s = pool.stats();
    expect(s.busy).toBe(1);
    expect(s.queued).toBe(2);
  });

  it('uses profile-based sizing', () => {
    const micro = WorkerPool.fromProfile('micro');
    expect(micro.stats().total).toBe(0);

    const lite = WorkerPool.fromProfile('lite');
    expect(lite.stats().total).toBe(1);

    const standard = WorkerPool.fromProfile('standard');
    expect(standard.stats().total).toBe(2);

    const full = WorkerPool.fromProfile('full');
    expect(full.stats().total).toBe(POOL_SIZES['full']);
  });

  it('throws on unknown profile', () => {
    expect(() => WorkerPool.fromProfile('imaginary')).toThrow(
      /Unknown resource profile/,
    );
  });

  it('cooperative scheduling (pool size 0) runs all tasks immediately', async () => {
    const pool = new WorkerPool(0);

    const p1 = pool.submit<string>({ type: 'echo', data: 'one' });
    const p2 = pool.submit<string>({ type: 'echo', data: 'two' });
    const p3 = pool.submit<string>({ type: 'echo', data: 'three' });

    // With pool size 0, nothing is queued — all execute immediately
    expect(pool.stats().queued).toBe(0);

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['one', 'two', 'three']);
    await pool.shutdown();
  });
});
