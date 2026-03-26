import AdmZip from 'adm-zip';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { configureWorkspaceTalentConfig, resolveWorkspaceSource } from './workspace-config.js';

interface WorkspaceExportOptions {
  workspace?: string;
  output?: string;
}

export const EXPORT_WORKSPACE_USAGE = `Usage: talent-scout export workspace [options]

Options:
  --workspace <path>   Workspace-data directory to export; defaults to workspace-data/
  --output <path>      Output zip path; defaults to a new temp directory

The command only creates a workspace-data.zip archive and prints its absolute path.
Sending that file to an IM/channel should be handled by another OpenClaw skill.`.trim();

function parseWorkspaceExportOptions(args: string[]): WorkspaceExportOptions {
  const options: WorkspaceExportOptions = {};

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
      case 'output':
        options.output = requireValue();
        break;
      default:
        throw new Error(`Unknown option: --${rawKey}`);
    }
  }

  return options;
}

async function resolveArchivePath(outputPath?: string): Promise<string> {
  if (outputPath) {
    const resolvedOutputPath = isAbsolute(outputPath) ? outputPath : resolve(outputPath);
    await mkdir(dirname(resolvedOutputPath), { recursive: true });
    return resolvedOutputPath;
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'talent-scout-workspace-export-'));
  return join(tempRoot, 'workspace-data.zip');
}

export async function runExportWorkspaceCommand(optionArgs: string[] = []): Promise<string> {
  if (optionArgs.includes('--help')) {
    console.log(EXPORT_WORKSPACE_USAGE);
    return '';
  }

  const options = parseWorkspaceExportOptions(optionArgs);
  const workspaceDir = await resolveWorkspaceSource(options.workspace);
  await configureWorkspaceTalentConfig(workspaceDir);
  const archivePath = await resolveArchivePath(options.output);

  const zip = new AdmZip();
  zip.addLocalFolder(workspaceDir, 'workspace-data');
  zip.writeZip(archivePath);

  console.log(`[skills] Workspace archive ready: ${archivePath}`);
  console.log(
    '[skills] Use another OpenClaw skill if you want to deliver this file through a channel.'
  );

  return archivePath;
}
