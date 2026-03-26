import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * File-backed checkpoint for resumable long-running processes.
 * Tracks completed steps with optional associated data.
 * All mutations are persisted to disk immediately (atomic write).
 */
export class Checkpoint {
  private state: Record<string, unknown> = {};

  constructor(private readonly filePath: string) {}

  /** Load checkpoint state from disk. Missing file → empty state. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      this.state = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.state = {};
    }
  }

  /** Persist current state to disk atomically. */
  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    await writeFile(tmp, JSON.stringify(this.state, null, 2));
    await rename(tmp, this.filePath);
  }

  /** Check if a step has been completed. */
  isComplete(step: string): boolean {
    return step in this.state;
  }

  /** Get the data stored for a completed step. */
  get(step: string): unknown {
    return this.state[step];
  }

  /** Mark a step complete with optional data and persist immediately. */
  async mark(step: string, data: unknown = true): Promise<void> {
    this.state[step] = data;
    await this.save();
  }

  /** Delete the checkpoint file (call after successful completion). */
  async remove(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch {
      // already gone
    }
  }
}

/**
 * Find an incomplete run directory or create a new timestamped one.
 * A run is considered complete if it contains a `.complete` marker file.
 */
export async function findOrCreateRunDir(baseDir: string): Promise<string> {
  await mkdir(baseDir, { recursive: true });

  const entries = await readdir(baseDir, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();

  // Look for the most recent incomplete run
  for (const dir of dirs) {
    const dirPath = join(baseDir, dir);
    try {
      const inner = await readdir(dirPath);
      if (!inner.includes('.complete')) {
        console.log(`Resuming incomplete run: ${dir}`);
        return dirPath;
      }
    } catch {
      // skip unreadable dirs
    }
  }

  // Create a new timestamped directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const outputDir = join(baseDir, timestamp);
  await mkdir(outputDir, { recursive: true });
  return outputDir;
}
