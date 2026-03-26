import { build } from 'esbuild';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const sourceSkillPath = join(packageRoot, 'SKILL.md');
const sourceReferencesDir = join(packageRoot, 'references');
const sourceTalentsConfigPath = join(packageRoot, 'talents.yaml');
const defaultBundleRoot = join(packageRoot, 'dist', 'clawhub');
const publishedSkillName = 'chinese-talent-scout';

const skillNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ClawHubBundleOptions {
  outDir?: string;
}

export interface ClawHubBundleResult {
  sourceSkillName: string;
  skillName: string;
  bundleDir: string;
  entryScriptPath: string;
}

export function parseSkillName(skillMarkdown: string): string {
  const frontmatterMatch = skillMarkdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) {
    throw new Error('SKILL.md must start with YAML frontmatter.');
  }

  const nameMatch = frontmatterMatch[1]?.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (!nameMatch) {
    throw new Error('SKILL.md frontmatter must contain a name field.');
  }

  return nameMatch[1]?.trim() ?? '';
}

export function validateSkillName(skillName: string): void {
  if (skillName.length < 1 || skillName.length > 64) {
    throw new Error('SKILL name must be 1-64 characters.');
  }

  if (!skillNamePattern.test(skillName)) {
    throw new Error(
      'SKILL name must use lowercase letters, numbers, and single hyphens only, without leading or trailing hyphens.'
    );
  }
}

export function rewriteSkillName(skillMarkdown: string, skillName: string): string {
  validateSkillName(skillName);
  return skillMarkdown.replace(/^name:\s*["']?([^"'\n]+)["']?\s*$/m, `name: ${skillName}`);
}

export async function buildClawHubBundle(
  options: ClawHubBundleOptions = {}
): Promise<ClawHubBundleResult> {
  const skillMarkdown = await readFile(sourceSkillPath, 'utf-8');
  const sourceSkillName = parseSkillName(skillMarkdown);
  validateSkillName(sourceSkillName);
  const skillName = publishedSkillName;
  const publishedSkillMarkdown = rewriteSkillName(skillMarkdown, skillName);

  const bundleRoot = resolve(options.outDir ?? defaultBundleRoot);
  const bundleDir = join(bundleRoot, skillName);
  const scriptsDir = join(bundleDir, 'scripts');
  const entryScriptPath = join(scriptsDir, 'talent-scout.mjs');
  const shellWrapperPath = join(scriptsDir, 'talent-scout.sh');

  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(scriptsDir, { recursive: true });

  await writeFile(join(bundleDir, 'SKILL.md'), publishedSkillMarkdown);
  await cp(sourceTalentsConfigPath, join(bundleDir, 'talents.yaml'));
  await cp(sourceReferencesDir, join(bundleDir, 'references'), { recursive: true });
  await cp(join(repoRoot, 'LICENSE'), join(bundleDir, 'LICENSE'));

  await build({
    entryPoints: [join(packageRoot, 'src', 'index.ts')],
    outfile: entryScriptPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    banner: {
      js: '#!/usr/bin/env node',
    },
    legalComments: 'eof',
    external: ['chromium-bidi', 'chromium-bidi/*', 'playwright-core', 'playwright-core/*'],
  });

  await writeFile(
    shellWrapperPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if ! command -v node >/dev/null 2>&1; then',
      '  echo "Node.js 22+ is required to run this skill." >&2',
      '  exit 1',
      'fi',
      'exec node "$(dirname "$0")/talent-scout.mjs" "$@"',
      '',
    ].join('\n')
  );

  await chmod(entryScriptPath, 0o755);
  await chmod(shellWrapperPath, 0o755);

  return {
    sourceSkillName,
    skillName,
    bundleDir,
    entryScriptPath,
  };
}

async function main(): Promise<void> {
  const result = await buildClawHubBundle();
  console.log(`[skills] ClawHub bundle ready: ${result.bundleDir}`);
  console.log(`[skills] Publish with: clawhub publish "${result.bundleDir}"`);
}

const isDirectExecution =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error('Error:', error);
    process.exitCode = 1;
  });
}
