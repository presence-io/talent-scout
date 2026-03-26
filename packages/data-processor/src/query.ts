import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Candidate, IdentityResult } from '@talent-scout/shared';

/** Load processed candidates from a processed output directory. */
export async function loadProcessedCandidates(
  processedDir: string,
): Promise<Record<string, Candidate>> {
  const raw = await readFile(join(processedDir, 'merged.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, Candidate>;
}

/** Load identity results from a processed output directory. */
export async function loadIdentityResults(
  processedDir: string,
): Promise<Record<string, IdentityResult>> {
  const raw = await readFile(join(processedDir, 'identity.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, IdentityResult>;
}
