import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Candidate } from '@talent-scout/shared';

vi.mock('@talent-scout/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talent-scout/shared')>();
  return {
    ...actual,
    loadConfig: vi.fn().mockResolvedValue(actual.TalentConfigSchema.parse({})),
    callAgent: vi.fn().mockResolvedValue({ results: [] }),
  };
});

vi.mock('@talent-scout/data-processor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talent-scout/data-processor')>();
  return {
    ...actual,
    identifyCandidate: vi.fn((c: Candidate) => {
      c.identity = {
        china_confidence: 0.9,
        city: 'beijing',
        signals: [],
        ai_assisted: false,
        inferred_at: new Date().toISOString(),
      };
    }),
    evaluateCandidate: vi.fn((c: Candidate) => {
      c.evaluation = {
        skill_score: 7,
        skill_evidence: ['test'],
        ai_depth_score: 6,
        ai_depth_tier: 'user' as const,
        ai_depth_evidence: ['test'],
        reachability_score: 5,
        reachability_evidence: ['test'],
        fit_score: 6,
        fit_evidence: ['test'],
        final_score: 6.5,
        recommended_action: 'monitor' as const,
        summary: 'test',
        evaluated_at: new Date().toISOString(),
      };
    }),
  };
});

import { runPipeline } from '../src/pipeline.js';

describe('runPipeline', () => {
  let inputDir: string;
  let outputDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const base = await mkdtemp(join(tmpdir(), 'pipeline-'));
    inputDir = base;
    outputDir = join(base, 'output');
    await mkdir(outputDir, { recursive: true });
  });

  async function writeInputFiles(candidates: Record<string, Candidate>): Promise<void> {
    await writeFile(join(inputDir, 'step2_merged.json'), JSON.stringify(candidates));

    const profiles: Record<string, unknown> = {};
    for (const [username, c] of Object.entries(candidates)) {
      if (c.profile) {
        profiles[username] = c.profile;
      }
    }
    await writeFile(join(inputDir, 'step3_profiles.json'), JSON.stringify(profiles));
  }

  it('should run pipeline end-to-end with skipAI', async () => {
    const candidates: Record<string, Candidate> = {
      user1: {
        username: 'user1',
        signals: [{ type: 'code:claude-md', detail: 'test', weight: 1, source: 'test' }],
        signal_score: 1,
        is_ai_coding_enthusiast: false,
      },
    };
    await writeInputFiles(candidates);

    await runPipeline({ inputDir, outputDir, skipAI: true });

    // Verify output files were written
    const { readFile } = await import('node:fs/promises');
    const evaluated = JSON.parse(await readFile(join(outputDir, 'step4_evaluated.json'), 'utf-8'));
    expect(evaluated).toHaveProperty('user1');

    const shortlist = JSON.parse(await readFile(join(outputDir, 'shortlist.json'), 'utf-8'));
    expect(Array.isArray(shortlist)).toBe(true);
  });

  it('should produce SKILLS-pending.md', async () => {
    await writeInputFiles({
      user1: {
        username: 'user1',
        signals: [],
        signal_score: 0,
        is_ai_coding_enthusiast: false,
      },
    });

    await runPipeline({ inputDir, outputDir, skipAI: true });

    const { readFile } = await import('node:fs/promises');
    const skillsPending = await readFile(join(inputDir, 'SKILLS-pending.md'), 'utf-8');
    expect(skillsPending).toContain('Total candidates: 1');
  });

  it('should handle empty candidate set', async () => {
    await writeInputFiles({});
    await runPipeline({ inputDir, outputDir, skipAI: true });

    const { readFile } = await import('node:fs/promises');
    const shortlist = JSON.parse(await readFile(join(outputDir, 'shortlist.json'), 'utf-8'));
    expect(shortlist).toHaveLength(0);
  });
});
