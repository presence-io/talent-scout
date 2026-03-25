import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

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
  return process.env['TALENT_OUTPUT_DIR'] ?? join(base, 'output');
}

export function resolveUserDataDir(base: string): string {
  return process.env['TALENT_USER_DATA_DIR'] ?? join(base, 'user-data');
}
