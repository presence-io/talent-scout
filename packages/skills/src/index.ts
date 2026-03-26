import { runCollectCommand, runProcessCommand, runEvaluateCommand } from './commands.js';

export async function runPipelineCommand(): Promise<void> {
  console.log('Running full pipeline: collect → process → evaluate');
  await runCollectCommand();
  await runProcessCommand();
  await runEvaluateCommand();
  console.log('Pipeline complete.');
}

export { runCollectCommand, runProcessCommand, runEvaluateCommand } from './commands.js';
export { cronStatus, cronSync } from './cron.js';
export { queryShortlist, queryCandidate, queryStats } from './query.js';
export { loadPatches, applyPatches } from './patches.js';
export { renderShortlistText, renderCandidateText, renderStatsText } from './renderers.js';
export type { SkillPatch } from './patches.js';

const USAGE = `
Usage: talent-scout <command> [options]

Commands:
  collect              Run data collection
  process              Run data processing
  evaluate             Run AI evaluation
  pipeline             Run full pipeline (collect → process → evaluate)
  query shortlist      Show shortlist
  query candidate <u>  Show candidate details
  query stats          Show run statistics
  cron status          Show cron job configuration
  cron sync            Sync cron jobs to OpenClaw
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  switch (command) {
    case 'collect':
      await runCollectCommand();
      break;
    case 'process':
      await runProcessCommand();
      break;
    case 'evaluate':
      await runEvaluateCommand();
      break;
    case 'pipeline':
      await runPipelineCommand();
      break;
    case 'query': {
      const { queryShortlist, queryCandidate, queryStats } = await import('./query.js');
      const { renderShortlistText, renderCandidateText, renderStatsText } =
        await import('./renderers.js');
      switch (subcommand) {
        case 'shortlist': {
          const entries = await queryShortlist();
          console.log(renderShortlistText(entries));
          break;
        }
        case 'candidate': {
          const username = args[2];
          if (!username) {
            console.error('Usage: talent-scout query candidate <username>');
            process.exitCode = 1;
            return;
          }
          const candidate = await queryCandidate(username);
          if (!candidate) {
            console.error(`Candidate "${username}" not found.`);
            process.exitCode = 1;
            return;
          }
          console.log(renderCandidateText(candidate));
          break;
        }
        case 'stats': {
          const stats = await queryStats();
          console.log(renderStatsText(stats));
          break;
        }
        default:
          console.error(`Unknown query subcommand: ${String(subcommand)}`);
          console.log(USAGE);
          process.exitCode = 1;
      }
      break;
    }
    case 'cron': {
      const { cronStatus, cronSync } = await import('./cron.js');
      switch (subcommand) {
        case 'status':
          await cronStatus();
          break;
        case 'sync':
          await cronSync();
          break;
        default:
          console.error(`Unknown cron subcommand: ${String(subcommand)}`);
          console.log(USAGE);
          process.exitCode = 1;
      }
      break;
    }
    default:
      console.log(USAGE);
      if (command) {
        process.exitCode = 1;
      }
  }
}

// Only run main when executed directly (not imported)
const isDirectExecution =
  process.argv[1]?.endsWith('/skills/src/index.ts') ||
  process.argv[1]?.endsWith('/skills/dist/index.js');

if (isDirectExecution) {
  main().catch((err: unknown) => {
    console.error('Error:', err);
    process.exitCode = 1;
  });
}
