import { runPipeline } from '@talent-scout/ai-evaluator';
import { runCollect } from '@talent-scout/data-collector';
import { runProcessPipeline } from '@talent-scout/data-processor';
import { findOrCreateRunDir, resolveOutputDir, resolveUserDataDir } from '@talent-scout/shared';
import { rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Run data collection via data-collector. */
export async function runCollectCommand(): Promise<void> {
  console.log('  [collect] Starting data collection from GitHub, community, stargazers, rankings...');
  await runCollect();
  console.log('  [collect] Data collection complete.');
}

/** Run data processing (merge → identity → scoring). */
export async function runProcessCommand(): Promise<void> {
  console.log('  [process] Starting data processing (merge → hydrate → identity → scoring)...');
  const result = await runProcessPipeline();
  console.log(`  [process] Results:`);
  console.log(`    📊 Total candidates:   ${String(result.candidateCount)}`);
  console.log(`    🔍 Identified Chinese: ${String(result.identifiedCount)}`);
  console.log(`    👤 Profiles fetched:   ${String(result.fetchedProfiles)}`);
  console.log(`    📁 Output: ${result.outputDir}`);
}

/** Run AI evaluation via ai-evaluator. */
export async function runEvaluateCommand(): Promise<void> {
  const skipAI = process.argv.includes('--skip-ai');
  console.log(`  [evaluate] Starting AI evaluation (skipAI=${String(skipAI)})...`);
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
