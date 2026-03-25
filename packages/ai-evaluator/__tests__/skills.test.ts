import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';

import { describe, it, expect } from 'vitest';

import type { Candidate, Evaluation } from '@talent-scout/shared';

import { computeRunStats, formatStatsEntry, appendSkillsPending } from '../src/skills.js';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    username: 'testuser',
    signals: [],
    signal_score: 1,
    is_ai_coding_enthusiast: false,
    ...overrides,
  };
}

function makeEval(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    skill_score: 7,
    skill_evidence: [],
    ai_depth_score: 6,
    ai_depth_tier: 'user',
    ai_depth_evidence: [],
    reachability_score: 5,
    reachability_evidence: [],
    fit_score: 6,
    fit_evidence: [],
    final_score: 6.5,
    recommended_action: 'monitor',
    summary: '',
    evaluated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeRunStats', () => {
  it('should compute stats from evaluated candidates', () => {
    const candidates = [
      makeCandidate({
        username: 'a',
        identity: {
          china_confidence: 0.9,
          city: 'beijing',
          signals: [],
          ai_assisted: false,
          inferred_at: '',
        },
        evaluation: makeEval({
          skill_score: 8,
          ai_depth_score: 7,
          recommended_action: 'reach_out',
        }),
      }),
      makeCandidate({
        username: 'b',
        identity: {
          china_confidence: 0.6,
          city: null,
          signals: [],
          ai_assisted: false,
          inferred_at: '',
        },
        evaluation: makeEval({ skill_score: 5, ai_depth_score: 4, recommended_action: 'monitor' }),
      }),
      makeCandidate({
        username: 'c',
        identity: {
          china_confidence: 0.3,
          city: null,
          signals: [],
          ai_assisted: false,
          inferred_at: '',
        },
      }),
    ];

    const stats = computeRunStats(candidates);
    expect(stats.total_candidates).toBe(3);
    expect(stats.identified_chinese).toBe(2); // a=0.9, b=0.6 >= 0.5
    expect(stats.evaluated).toBe(2);
    expect(stats.reach_out).toBe(1);
    expect(stats.monitor).toBe(1);
    expect(stats.skip).toBe(0);
    expect(stats.avg_skill_score).toBe(6.5); // (8+5)/2
    expect(stats.avg_ai_depth_score).toBe(5.5); // (7+4)/2
  });

  it('should handle empty candidates', () => {
    const stats = computeRunStats([]);
    expect(stats.total_candidates).toBe(0);
    expect(stats.evaluated).toBe(0);
    expect(stats.avg_skill_score).toBe(0);
  });

  it('should count skip actions', () => {
    const candidates = [
      makeCandidate({
        evaluation: makeEval({ recommended_action: 'skip', skill_score: 2, ai_depth_score: 1 }),
      }),
    ];
    const stats = computeRunStats(candidates);
    expect(stats.skip).toBe(1);
    expect(stats.reach_out).toBe(0);
  });
});

describe('formatStatsEntry', () => {
  it('should format stats as markdown', () => {
    const stats = computeRunStats([
      makeCandidate({
        evaluation: makeEval({
          recommended_action: 'reach_out',
          skill_score: 8,
          ai_depth_score: 7,
        }),
      }),
    ]);
    const entry = formatStatsEntry(stats);
    expect(entry).toContain('## Run');
    expect(entry).toContain('Total candidates: 1');
    expect(entry).toContain('Reach out: 1');
  });
});

describe('appendSkillsPending', () => {
  it('should create SKILLS-pending.md if not exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-'));
    const stats = computeRunStats([
      makeCandidate({
        evaluation: makeEval({ recommended_action: 'monitor' }),
      }),
    ]);
    await appendSkillsPending(dir, stats);
    const content = await readFile(join(dir, 'SKILLS-pending.md'), 'utf-8');
    expect(content).toContain('# SKILLS Pending Updates');
    expect(content).toContain('Evaluated: 1');
  });

  it('should append to existing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skills-'));
    const stats1 = computeRunStats([]);
    const stats2 = computeRunStats([
      makeCandidate({
        evaluation: makeEval({ recommended_action: 'reach_out' }),
      }),
    ]);
    await appendSkillsPending(dir, stats1);
    await appendSkillsPending(dir, stats2);
    const content = await readFile(join(dir, 'SKILLS-pending.md'), 'utf-8');
    // Should contain header only once, and two run entries
    expect(content.match(/# SKILLS Pending Updates/g)).toHaveLength(1);
    expect(content.match(/## Run/g)).toHaveLength(2);
  });
});
