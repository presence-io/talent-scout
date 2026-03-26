import { runCollectCommand, runEvaluateCommand, runProcessCommand } from './commands.js';

export async function runPipelineCommand(): Promise<void> {
  console.log('Running full pipeline: collect → process → evaluate');
  await runCollectCommand();
  await runProcessCommand();
  await runEvaluateCommand();
  console.log('Pipeline complete.');
}

export { runCollectCommand, runProcessCommand, runEvaluateCommand } from './commands.js';
export { runConfigRequestCommand } from './config-request.js';
export { cronStatus, cronSync, cronRuns, cronRun, cronDisable, cronEnable } from './cron.js';
export type { CronRunInfo } from './cron.js';
export { runExportWorkspaceCommand } from './export.js';
export { queryShortlist, queryCandidate, queryStats } from './query.js';
export { loadPatches, applyPatches, satisfiesVersion, writeAppliedManifest } from './patches.js';
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
  export workspace     Zip workspace-data and print the resulting file path
  config request       Send a channel message describing a talents.yaml change request
  cron status          Show cron job configuration
  cron sync            Sync cron jobs to OpenClaw
  cron runs            List recent cron run history
  cron run <name>      Show details of a specific cron run
  cron disable <name>  Disable a cron job
  cron enable <name>   Enable a cron job
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  if (command && ['collect', 'process', 'evaluate', 'pipeline', 'cron'].includes(command)) {
    const { configureWorkspaceTalentConfig } = await import('./workspace-config.js');
    await configureWorkspaceTalentConfig();
  }

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
    case 'export': {
      const { EXPORT_WORKSPACE_USAGE, runExportWorkspaceCommand } = await import('./export.js');

      switch (subcommand) {
        case 'workspace':
          await runExportWorkspaceCommand(args.slice(2));
          break;
        default:
          console.error(`Unknown export subcommand: ${String(subcommand)}`);
          console.log(EXPORT_WORKSPACE_USAGE);
          process.exitCode = 1;
      }
      break;
    }
    case 'config': {
      const { CONFIG_REQUEST_USAGE, runConfigRequestCommand } = await import('./config-request.js');

      switch (subcommand) {
        case 'request':
          await runConfigRequestCommand(args.slice(2));
          break;
        default:
          console.error(`Unknown config subcommand: ${String(subcommand)}`);
          console.log(CONFIG_REQUEST_USAGE);
          process.exitCode = 1;
      }
      break;
    }
    case 'cron': {
      const { cronStatus, cronSync, cronRuns, cronRun, cronDisable, cronEnable } =
        await import('./cron.js');
      switch (subcommand) {
        case 'status':
          await cronStatus();
          break;
        case 'sync':
          await cronSync();
          break;
        case 'runs': {
          const runs = await cronRuns();
          console.log(JSON.stringify(runs, null, 2));
          break;
        }
        case 'run': {
          const name = args[2];
          if (!name) {
            console.error('Usage: talent-scout cron run <name>');
            process.exitCode = 1;
            return;
          }
          const run = await cronRun(name);
          if (!run) {
            console.error(`Cron run "${name}" not found.`);
            process.exitCode = 1;
            return;
          }
          console.log(JSON.stringify(run, null, 2));
          break;
        }
        case 'disable': {
          const name = args[2];
          if (!name) {
            console.error('Usage: talent-scout cron disable <name>');
            process.exitCode = 1;
            return;
          }
          await cronDisable(name);
          break;
        }
        case 'enable': {
          const name = args[2];
          if (!name) {
            console.error('Usage: talent-scout cron enable <name>');
            process.exitCode = 1;
            return;
          }
          await cronEnable(name);
          break;
        }
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
