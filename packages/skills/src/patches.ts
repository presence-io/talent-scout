import { resolvePatchDir } from '@talent-scout/shared';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SkillPatch {
  id: string;
  target: string;
  applies_to: string;
  kind: string;
  priority: number;
  content: string;
}

interface PatchFrontmatter {
  id: string;
  target: string;
  applies_to: string;
  kind: string;
  priority: number;
}

interface AppliedRecord {
  applied_at: string;
  patches: string[];
  skipped: string[];
}

function parseFrontmatter(raw: string): { frontmatter: PatchFrontmatter; content: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) return null;

  const lines = match[1].split('\n');
  const fm: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    fm[key] = val;
  }

  if (!fm['id'] || !fm['target'] || !fm['applies_to'] || !fm['kind']) return null;

  return {
    frontmatter: {
      id: fm['id'],
      target: fm['target'],
      applies_to: fm['applies_to'],
      kind: fm['kind'],
      priority: Number(fm['priority'] ?? '0'),
    },
    content: match[2],
  };
}

/**
 * Check if a version satisfies a simple semver constraint.
 * Supports: "*", ">=X.Y.Z", "X.Y.Z" (exact), ">=X.Y" (minor prefix).
 */
export function satisfiesVersion(version: string, constraint: string): boolean {
  if (constraint === '*') return true;

  const parseVer = (v: string): number[] => v.replace(/^>=?/, '').split('.').map(Number);

  if (constraint.startsWith('>=')) {
    const required = parseVer(constraint);
    const actual = parseVer(version);
    for (let i = 0; i < Math.max(required.length, actual.length); i++) {
      const r = required[i] ?? 0;
      const a = actual[i] ?? 0;
      if (a > r) return true;
      if (a < r) return false;
    }
    return true; // equal
  }

  // Exact match
  return version === constraint;
}

/** Load all skill patches from the workspace data directory. */
export async function loadPatches(patchDir?: string): Promise<SkillPatch[]> {
  const baseDir = patchDir ?? resolvePatchDir();

  // Try talent-skills subdirectory first, fall back to base dir
  const dirs = [join(baseDir, 'talent-skills'), baseDir];
  let files: string[] = [];
  let resolvedDir = baseDir;

  for (const dir of dirs) {
    try {
      files = await readdir(dir);
      resolvedDir = dir;
      break;
    } catch {
      continue;
    }
  }

  if (files.length === 0) return [];

  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const patches: SkillPatch[] = [];

  for (const file of mdFiles) {
    const raw = await readFile(join(resolvedDir, file), 'utf-8');
    const parsed = parseFrontmatter(raw);
    if (parsed) {
      patches.push({
        ...parsed.frontmatter,
        content: parsed.content,
      });
    }
  }

  return patches.sort((a, b) => b.priority - a.priority);
}

/**
 * Apply patches as overlay: filter by version compatibility, merge content,
 * and record applied patches. Returns merged overlay strings.
 */
export function applyPatches(
  _baseSkills: string[],
  patches: SkillPatch[],
  currentVersion = '0.0.0'
): { applied: string[]; skipped: SkillPatch[] } {
  const applied: string[] = [];
  const skipped: SkillPatch[] = [];

  for (const patch of patches) {
    if (!satisfiesVersion(currentVersion, patch.applies_to)) {
      console.warn(
        `Patch "${patch.id}" requires ${patch.applies_to} but current version is ${currentVersion} — skipping`
      );
      skipped.push(patch);
      continue;
    }
    applied.push(`[${patch.kind}:${patch.target}] ${patch.content.trim()}`);
  }

  return { applied, skipped };
}

/** Write a manifest recording which patches were applied. */
export async function writeAppliedManifest(
  manifestDir: string,
  applied: string[],
  skipped: SkillPatch[]
): Promise<void> {
  const record: AppliedRecord = {
    applied_at: new Date().toISOString(),
    patches: applied,
    skipped: skipped.map((p) => p.id),
  };
  const path = join(manifestDir, 'applied.json');
  await writeFile(path, JSON.stringify(record, null, 2) + '\n');
}
