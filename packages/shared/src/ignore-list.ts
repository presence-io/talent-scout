import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { IgnoreList } from './types.js';

const DEFAULT_PATH = 'user-data/ignore-list.json';

/**
 * Read the ignore list from `user-data/ignore-list.json`.
 * Returns an empty record if the file does not exist.
 */
export async function readIgnoreList(basePath?: string): Promise<IgnoreList> {
  const filePath = resolve(basePath ?? DEFAULT_PATH);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as IgnoreList;
  } catch {
    return {};
  }
}

/**
 * Check if a username is in the ignore list.
 */
export function isIgnored(ignoreList: IgnoreList, username: string): boolean {
  return username.toLowerCase() in ignoreList;
}
