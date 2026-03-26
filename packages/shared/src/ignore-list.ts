import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { IgnoreList } from './types.js';
import { resolveUserDataDir } from './workspace.js';

/**
 * Read the ignore list from `workspace-data/user-data/ignore-list.json`.
 * Returns an empty record if the file does not exist.
 */
export async function readIgnoreList(basePath?: string): Promise<IgnoreList> {
  const filePath = basePath ? resolve(basePath) : resolve(resolveUserDataDir(), 'ignore-list.json');
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
