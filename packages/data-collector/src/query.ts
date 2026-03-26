import type { Signal } from '@talent-scout/shared';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

interface RawCollectionFile {
  candidates: Record<string, Signal[]>;
}

/** Load and merge all raw signal files from a raw collection directory. */
export async function loadRawSignals(rawDir: string): Promise<Record<string, Signal[]>> {
  const files = await readdir(rawDir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const merged: Record<string, Signal[]> = {};
  for (const file of jsonFiles) {
    const raw = await readFile(join(rawDir, file), 'utf-8');
    const data = JSON.parse(raw) as RawCollectionFile;
    for (const [username, signals] of Object.entries(data.candidates)) {
      const existing = merged[username] ?? [];
      existing.push(...signals);
      merged[username] = existing;
    }
  }
  return merged;
}
