import type { OpenClawChannel } from '@talent-scout/shared';
import { loadConfig, sendMessage } from '@talent-scout/shared';

import { configureWorkspaceTalentConfig, resolveWorkspaceSource } from './workspace-config.js';

interface ConfigRequestOptions {
  workspace?: string;
  channel?: OpenClawChannel;
  target?: string;
  account?: string;
  threadId?: string;
  request?: string;
  message?: string;
  dryRun: boolean;
}

export const CONFIG_REQUEST_USAGE = `Usage: talent-scout config request [options]

Options:
  --workspace <path>   Workspace-data directory to target; defaults to workspace-data/
  --request <text>     Natural-language change request for workspace-data/talents.yaml
  --channel <name>     OpenClaw channel (telegram, discord, slack, ...)
  --target <dest>      Channel target/recipient identifier
  --account <id>       Channel account id when OpenClaw requires it
  --thread-id <id>     Thread id for channels that support threaded delivery
  --message <text>     Custom message body; skips the default request template
  --dry-run            Ask OpenClaw to print the payload only

If --channel/--target are omitted, the command falls back to talents.yaml openclaw.delivery.`.trim();

function parseConfigRequestOptions(args: string[]): ConfigRequestOptions {
  const options: ConfigRequestOptions = { dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKeyPart, inlineValue] = arg.slice(2).split('=', 2);
    const rawKey = rawKeyPart ?? '';
    const requireValue = (): string => {
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for --${rawKey}.`);
      }
      if (inlineValue === undefined) {
        index += 1;
      }
      return value;
    };

    switch (rawKey) {
      case 'workspace':
        options.workspace = requireValue();
        break;
      case 'request':
        options.request = requireValue();
        break;
      case 'channel':
        options.channel = requireValue() as OpenClawChannel;
        break;
      case 'target':
        options.target = requireValue();
        break;
      case 'account':
        options.account = requireValue();
        break;
      case 'thread-id':
        options.threadId = requireValue();
        break;
      case 'message':
        options.message = requireValue();
        break;
      case 'dry-run':
        options.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option: --${rawKey}`);
    }
  }

  return options;
}

function buildConfigRequestMessage(talentsConfigPath: string, request: string): string {
  return [
    'Please update the Talent Scout workspace configuration.',
    '',
    `Editable config file: ${talentsConfigPath}`,
    '',
    'Requested change:',
    request,
    '',
    'Apply the update directly to that YAML file and preserve unrelated keys.',
  ].join('\n');
}

export async function runConfigRequestCommand(optionArgs: string[] = []): Promise<void> {
  if (optionArgs.includes('--help')) {
    console.log(CONFIG_REQUEST_USAGE);
    return;
  }

  const options = parseConfigRequestOptions(optionArgs);
  if (!options.request && !options.message) {
    throw new Error('Config requests require --request, unless you provide a full --message.');
  }

  const workspaceDir = await resolveWorkspaceSource(options.workspace);
  const talentsConfigPath = await configureWorkspaceTalentConfig(workspaceDir);
  const config = await loadConfig(true);
  const delivery = config.openclaw.delivery;
  const channel = options.channel ?? delivery?.channel;
  const target = options.target ?? delivery?.target;
  const account = options.account ?? delivery?.account;
  const threadId = options.threadId ?? delivery?.thread_id;

  if (!channel || !target) {
    throw new Error(
      'Config requests require --channel and --target, or talents.yaml openclaw.delivery defaults.'
    );
  }

  const message =
    options.message ?? buildConfigRequestMessage(talentsConfigPath, options.request ?? '');
  const result = await sendMessage({
    channel,
    target,
    account,
    threadId,
    message,
    dryRun: options.dryRun,
  });

  console.log(
    `[skills] Sent talents.yaml update request for ${talentsConfigPath} to ${channel}:${target}${options.dryRun ? ' (dry-run)' : ''}`
  );

  if (options.dryRun) {
    console.log(JSON.stringify(result, null, 2));
  }
}
