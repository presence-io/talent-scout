import { mkdir, readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { CacheEntry } from './types.js';

const DEFAULT_TTL = 86400; // 24 hours

export class FileCache {
  constructor(private readonly baseDir: string) {}

  /**
   * Get a cached value by key. Returns null if not found or expired.
   * Key format: "category/name" → stored at `{baseDir}/category/name.json`.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    const filePath = this.keyToPath(key);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (new Date(entry.expires_at) <= new Date()) {
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  /**
   * Store a value in cache with optional TTL (in seconds).
   */
  async set(key: string, data: unknown, ttl: number = DEFAULT_TTL): Promise<void> {
    const filePath = this.keyToPath(key);
    await mkdir(dirname(filePath), { recursive: true });

    const now = new Date();
    const entry: CacheEntry<unknown> = {
      data,
      fetched_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
    };

    // Atomic write: write to tmp then rename
    const tmpPath = filePath + '.tmp';
    await writeFile(tmpPath, JSON.stringify(entry, null, 2));
    const { rename } = await import('node:fs/promises');
    await rename(tmpPath, filePath);
  }

  /**
   * Check if a key exists and is not expired.
   */
  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  /**
   * Remove all expired entries from a category directory.
   */
  async cleanExpired(category: string): Promise<number> {
    const dir = join(this.baseDir, category);
    let cleaned = 0;

    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(dir, file);
        try {
          const raw = await readFile(filePath, 'utf-8');
          const entry = JSON.parse(raw) as CacheEntry<unknown>;
          if (new Date(entry.expires_at) <= new Date()) {
            await unlink(filePath);
            cleaned++;
          }
        } catch {
          // Skip malformed files
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return cleaned;
  }

  /**
   * Remove all entries from a category directory.
   */
  async purge(category: string): Promise<number> {
    const dir = join(this.baseDir, category);
    let purged = 0;

    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        await unlink(join(dir, file));
        purged++;
      }
    } catch {
      // Directory doesn't exist yet
    }

    return purged;
  }

  /**
   * Get cache stats for a category.
   */
  async stats(category: string): Promise<{ total: number; expired: number; sizeBytes: number }> {
    const dir = join(this.baseDir, category);
    let total = 0;
    let expired = 0;
    let sizeBytes = 0;

    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = join(dir, file);
        try {
          const [raw, fileStat] = await Promise.all([readFile(filePath, 'utf-8'), stat(filePath)]);
          total++;
          sizeBytes += fileStat.size;
          const entry = JSON.parse(raw) as CacheEntry<unknown>;
          if (new Date(entry.expires_at) <= new Date()) {
            expired++;
          }
        } catch {
          // Skip malformed files
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return { total, expired, sizeBytes };
  }

  private keyToPath(key: string): string {
    return join(this.baseDir, `${key}.json`);
  }
}
