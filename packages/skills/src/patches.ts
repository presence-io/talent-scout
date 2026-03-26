import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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

/** Load all skill patches from the workspace data directory. */
export async function loadPatches(patchDir?: string): Promise<SkillPatch[]> {
  const dir = patchDir ?? resolve('workspace-data', 'skill-patches');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const patches: SkillPatch[] = [];

  for (const file of mdFiles) {
    const raw = await readFile(join(dir, file), 'utf-8');
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

/** Apply patches as overlay (returns merged list, does not mutate originals). */
export function applyPatches(_baseSkills: string[], patches: SkillPatch[]): string[] {
  // Patches are additive overlays — they enhance, not replace
  return patches.map((p) => `[${p.kind}:${p.target}] ${p.content.trim()}`);
}
