import { runPipeline } from '@talent-scout/ai-evaluator';
import { runCollect } from '@talent-scout/data-collector';
import { runProcessPipeline } from '@talent-scout/data-processor';
import { findOrCreateRunDir, resolveOutputDir, resolveUserDataDir } from '@talent-scout/shared';
import { rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Run data collection via data-collector. */
export async function runCollectCommand(): Promise<void> {
  console.log('[skills] Running data collection...');
  await runCollect();
}

/** Run data processing (merge → identity → scoring). */
export async function runProcessCommand(): Promise<void> {
  console.log('[skills] Running data processing...');
  const result = await runProcessPipeline();
  console.log(
    `[skills] Processed ${String(result.candidateCount)} candidates, fetched ${String(result.fetchedProfiles)} profiles → ${result.outputDir}`
  );
}

/** Run AI evaluation via ai-evaluator. */
export async function runEvaluateCommand(): Promise<void> {
  console.log('[skills] Running AI evaluation...');
  const outputBase = resolveOutputDir();
  const userDataDir = resolveUserDataDir();
  const inputDir = resolve(outputBase, 'processed', 'latest');
  const evalBase = resolve(outputBase, 'evaluated');
  const outputDir = await findOrCreateRunDir(evalBase);

  await runPipeline({
    inputDir,
    outputDir,
    ignoreListPath: join(userDataDir, 'ignore-list.json'),
    skipAI: process.argv.includes('--skip-ai'),
  });

  // Mark complete and update latest symlink
  await writeFile(join(outputDir, '.complete'), new Date().toISOString());
  const latestLink = join(evalBase, 'latest');
  try {
    await rm(latestLink);
  } catch {
    /* ignore */
  }
  await symlink(outputDir, latestLink);
}
