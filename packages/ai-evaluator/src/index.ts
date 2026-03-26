import { resolveOutputDir, resolveUserDataDir } from '@talent-scout/shared';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { runPipeline } from './pipeline.js';

export { candidateToTalentEntry, produceShortlist } from './shortlist.js';
export { inferIdentityBatch } from './identity-ai.js';
export { deepEvaluateBatch } from './deep-eval.js';
export { computeRunStats, formatStatsEntry, appendSkillsPending } from './skills.js';
export type { RunStats } from './skills.js';
export { runPipeline } from './pipeline.js';
export type { PipelineOptions } from './pipeline.js';
export { loadShortlist, loadEvaluation, loadRunStats } from './query.js';

/** CLI entry point: pnpm --filter @talent-scout/ai-evaluator run evaluate */
async function main(): Promise<void> {
  const skipAI = process.argv.includes('--skip-ai');

  const outputBase = resolveOutputDir();
  const inputDir = resolve(outputBase, 'processed', 'latest');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const outputDir = resolve(outputBase, 'evaluated', timestamp);
  await mkdir(outputDir, { recursive: true });

  await runPipeline({
    inputDir,
    outputDir,
    ignoreListPath: join(resolveUserDataDir(), 'ignore-list.json'),
    skipAI,
  });

  // Update latest symlink
  const latestLink = join(outputBase, 'evaluated', 'latest');
  try {
    await rm(latestLink);
  } catch {
    // ignore if doesn't exist
  }
  await symlink(timestamp, latestLink);
}

main().catch((err: unknown) => {
  console.error('Pipeline failed:', err);
  process.exitCode = 1;
});
