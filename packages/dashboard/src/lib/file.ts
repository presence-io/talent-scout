import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n');
  await rename(tmpPath, filePath);
}

export function resolveOutputDir(base: string): string {
  return process.env['TALENT_OUTPUT_DIR'] ?? join(base, 'output', 'evaluated', 'latest');
}

export function resolveUserDataDir(base: string): string {
  return process.env['TALENT_USER_DATA_DIR'] ?? join(base, 'user-data');
}

export interface RunHistoryEntry {
  timestamp: string;
  isLatest: boolean;
}

/** List evaluation run timestamps from output/evaluated/ directory. */
export async function listRunHistory(base: string): Promise<RunHistoryEntry[]> {
  const evaluatedDir = join(resolveOutputDir(base), '..');
  try {
    const entries = await readdir(evaluatedDir, { withFileTypes: true });
    const dirs: RunHistoryEntry[] = [];
    let latestTarget: string | null = null;

    // Resolve 'latest' symlink target
    try {
      const latestStat = await lstat(join(evaluatedDir, 'latest'));
      if (latestStat.isSymbolicLink()) {
        const { readlink } = await import('node:fs/promises');
        latestTarget = await readlink(join(evaluatedDir, 'latest'));
      }
    } catch {
      // no latest symlink
    }

    for (const entry of entries) {
      if (entry.name === 'latest') continue;
      if (entry.isDirectory()) {
        dirs.push({
          timestamp: entry.name,
          isLatest: entry.name === latestTarget,
        });
      }
    }
    return dirs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {
    return [];
  }
}
