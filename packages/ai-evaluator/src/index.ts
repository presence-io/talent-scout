import { resolve } from 'node:path';

import { runPipeline } from './pipeline.js';

export { candidateToTalentEntry, produceShortlist } from './shortlist.js';
export { inferIdentityBatch } from './identity-ai.js';
export { deepEvaluateBatch } from './deep-eval.js';
export { computeRunStats, formatStatsEntry, appendSkillsPending } from './skills.js';
export type { RunStats } from './skills.js';
export { runPipeline } from './pipeline.js';
export type { PipelineOptions } from './pipeline.js';

/** CLI entry point: pnpm --filter @talent-scout/ai-evaluator run evaluate */
async function main(): Promise<void> {
  const skipAI = process.argv.includes('--skip-ai');
  const baseDir = process.cwd();

  await runPipeline({
    inputDir: resolve(baseDir, 'output'),
    outputDir: resolve(baseDir, 'output'),
    skipAI,
  });
}

main().catch((err: unknown) => {
  console.error('Pipeline failed:', err);
  process.exitCode = 1;
});
