import { execa } from 'execa';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildClawHubBundle,
  parseSkillName,
  rewriteSkillName,
  validateSkillName,
} from '../src/clawhub-bundle.js';

describe('clawhub bundle builder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'talent-scout-clawhub-bundle-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('parses and validates the skill name from SKILL.md frontmatter', () => {
    const skillName = parseSkillName('---\nname: skills\n---\n# Skill\n');

    expect(skillName).toBe('skills');
    expect(() => validateSkillName(skillName)).not.toThrow();
    expect(() => validateSkillName('Bad--Skill')).toThrow(
      'SKILL name must use lowercase letters, numbers, and single hyphens only, without leading or trailing hyphens.'
    );
  });

  it('rewrites the published skill name for the bundle output', () => {
    const published = rewriteSkillName('---\nname: skills\n---\n# Skill\n', 'chinese-talent-scout');

    expect(parseSkillName(published)).toBe('chinese-talent-scout');
  });

  it('builds a self-contained ClawHub bundle in a compliant directory', async () => {
    const result = await buildClawHubBundle({ outDir: tempDir });

    expect(result.sourceSkillName).toBe('skills');
    expect(result.skillName).toBe('chinese-talent-scout');
    expect(result.bundleDir).toBe(join(tempDir, 'chinese-talent-scout'));
    expect(existsSync(join(result.bundleDir, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(result.bundleDir, 'talents.yaml'))).toBe(true);
    expect(existsSync(join(result.bundleDir, 'references', 'security.md'))).toBe(true);
    expect(existsSync(join(result.bundleDir, 'scripts', 'talent-scout.mjs'))).toBe(true);
    expect(existsSync(join(result.bundleDir, 'scripts', 'talent-scout.sh'))).toBe(true);

    const bundledSkill = readFileSync(join(result.bundleDir, 'SKILL.md'), 'utf-8');
    expect(parseSkillName(bundledSkill)).toBe('chinese-talent-scout');

    const helpOutput = await execa('node', [join(result.bundleDir, 'scripts', 'talent-scout.mjs')]);
    expect(helpOutput.stdout).toContain('Usage: talent-scout <command> [options]');
  });
});
