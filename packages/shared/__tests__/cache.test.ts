import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach } from 'vitest';

import { FileCache } from '../src/cache.js';

function makeTmpDir() {
  return join(tmpdir(), `talent-scout-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('FileCache', () => {
  let cache: FileCache;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    cache = new FileCache(tmpDir);
  });

  it('should return null for missing key', async () => {
    const result = await cache.get('users/nonexistent');
    expect(result).toBeNull();
  });

  it('should set and get a value', async () => {
    await cache.set('users/alice', { name: 'Alice', score: 42 });
    const result = await cache.get<{ name: string; score: number }>('users/alice');
    expect(result).toEqual({ name: 'Alice', score: 42 });
  });

  it('should report has correctly', async () => {
    expect(await cache.has('users/bob')).toBe(false);
    await cache.set('users/bob', { name: 'Bob' });
    expect(await cache.has('users/bob')).toBe(true);
  });

  it('should return null for expired entries', async () => {
    // Set with 0-second TTL (immediately expired)
    await cache.set('users/expired', { name: 'Old' }, 0);

    // Wait 10ms to ensure expiry
    await new Promise((r) => setTimeout(r, 10));

    const result = await cache.get('users/expired');
    expect(result).toBeNull();
  });

  it('should not expire entries with long TTL', async () => {
    await cache.set('users/fresh', { name: 'Fresh' }, 86400);
    const result = await cache.get<{ name: string }>('users/fresh');
    expect(result).toEqual({ name: 'Fresh' });
  });

  it('should overwrite existing entries', async () => {
    await cache.set('users/update', { version: 1 });
    await cache.set('users/update', { version: 2 });
    const result = await cache.get<{ version: number }>('users/update');
    expect(result).toEqual({ version: 2 });
  });

  it('should clean expired entries', async () => {
    await cache.set('test/a', 'alive', 86400);
    await cache.set('test/b', 'expired', 0);
    await new Promise((r) => setTimeout(r, 10));

    const cleaned = await cache.cleanExpired('test');
    expect(cleaned).toBe(1);

    expect(await cache.get('test/a')).toBe('alive');
    expect(await cache.get('test/b')).toBeNull();
  });

  it('should purge all entries in a category', async () => {
    await cache.set('purge/a', 'data1');
    await cache.set('purge/b', 'data2');

    const purged = await cache.purge('purge');
    expect(purged).toBe(2);

    expect(await cache.get('purge/a')).toBeNull();
    expect(await cache.get('purge/b')).toBeNull();
  });

  it('should return stats for a category', async () => {
    await cache.set('stats/a', 'data1', 86400);
    await cache.set('stats/b', 'data2', 0);
    await new Promise((r) => setTimeout(r, 10));

    const s = await cache.stats('stats');
    expect(s.total).toBe(2);
    expect(s.expired).toBe(1);
    expect(s.sizeBytes).toBeGreaterThan(0);
  });

  it('should handle nested keys', async () => {
    await cache.set('github/users/alice', { login: 'alice' });
    const result = await cache.get<{ login: string }>('github/users/alice');
    expect(result).toEqual({ login: 'alice' });
  });

  it('should handle cleanExpired on non-existent directory', async () => {
    const cleaned = await cache.cleanExpired('nonexistent');
    expect(cleaned).toBe(0);
  });

  it('should handle purge on non-existent directory', async () => {
    const purged = await cache.purge('nonexistent');
    expect(purged).toBe(0);
  });
});
