import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { loadConfig } from '@talent-scout/shared';
import type { Candidate } from '@talent-scout/shared';
import { identifyCandidate, evaluateCandidate } from '@talent-scout/data-processor';

import { inferIdentityBatch } from './identity-ai.js';
import { deepEvaluateBatch } from './deep-eval.js';
import { produceShortlist } from './shortlist.js';
import { computeRunStats, appendSkillsPending } from './skills.js';

export interface PipelineOptions {
  /** Directory containing step2_merged.json and step3_profiles.json */
  inputDir: string;
  /** Directory to write evaluation output and shortlist */
  outputDir: string;
  /** Skip OpenClaw AI calls (rule-based only) */
  skipAI?: boolean;
}

interface MergedData {
  [username: string]: Candidate;
}

interface ProfileData {
  [username: string]: {
    login: string;
    name: string | null;
    location: string | null;
    email: string | null;
    blog: string | null;
    twitter: string | null;
    bio: string | null;
    company: string | null;
    hireable: boolean | null;
    public_repos: number;
    followers: number;
    following: number;
    created_at: string;
    updated_at: string;
    recent_repos: unknown[];
  };
}

/** Load merged candidates from step2_merged.json. */
async function loadCandidates(inputDir: string): Promise<Candidate[]> {
  const raw = await readFile(join(inputDir, 'step2_merged.json'), 'utf-8');
  const data = JSON.parse(raw) as MergedData;
  return Object.values(data);
}

/** Attach profiles from step3_profiles.json to candidates. */
async function attachProfiles(candidates: Candidate[], inputDir: string): Promise<void> {
  const raw = await readFile(join(inputDir, 'step3_profiles.json'), 'utf-8');
  const profiles = JSON.parse(raw) as ProfileData;

  for (const c of candidates) {
    const p = profiles[c.username];
    if (p) {
      c.profile = p as Candidate['profile'];
    }
  }
}

/**
 * Run the full evaluation pipeline:
 * 1. Load merged candidates + profiles
 * 2. Identity detection (rule-based + optional AI for gray area)
 * 3. Rule-based scoring for identified Chinese developers
 * 4. Optional AI deep evaluation for top candidates
 * 5. Produce shortlist
 * 6. Write output + update SKILLS
 */
export async function runPipeline(options: PipelineOptions): Promise<void> {
  const config = await loadConfig();

  // Step 1: Load data
  const candidates = await loadCandidates(options.inputDir);
  await attachProfiles(candidates, options.inputDir);

  // Step 2: Identity detection (rule-based)
  for (const c of candidates) {
    c.identity = identifyCandidate(c);
  }

  // Step 2b: AI identity inference for gray-area candidates
  if (!options.skipAI) {
    await inferIdentityBatch(candidates, config);
  }

  // Step 3: Rule-based evaluation for identified Chinese developers
  const identified = candidates.filter((c) => (c.identity?.china_confidence ?? 0) >= 0.5);
  for (const c of identified) {
    c.evaluation = evaluateCandidate(c, config);
  }

  // Step 4: AI deep evaluation for top candidates
  if (!options.skipAI) {
    await deepEvaluateBatch(identified, config);
  }

  // Step 5: Produce shortlist
  const shortlist = produceShortlist(identified);

  // Step 6: Write output
  await mkdir(options.outputDir, { recursive: true });
  await writeOutput(options.outputDir, candidates, shortlist);

  // Step 7: Update SKILLS-pending
  const stats = computeRunStats(candidates);
  await appendSkillsPending(dirname(options.outputDir), stats);

  logSummary(stats, shortlist.length);
}

async function writeOutput(
  outputDir: string,
  candidates: Candidate[],
  shortlist: ReturnType<typeof produceShortlist>,
): Promise<void> {
  const evaluated: Record<string, Candidate> = {};
  for (const c of candidates) {
    evaluated[c.username] = c;
  }

  await writeFile(join(outputDir, 'step4_evaluated.json'), JSON.stringify(evaluated, null, 2));
  await writeFile(join(outputDir, 'shortlist.json'), JSON.stringify(shortlist, null, 2));
}

function logSummary(stats: RunStats, shortlistCount: number): void {
  console.log('=== Evaluation Pipeline Complete ===');
  console.log(`Candidates: ${String(stats.total_candidates)}`);
  console.log(`Identified Chinese: ${String(stats.identified_chinese)}`);
  console.log(`Evaluated: ${String(stats.evaluated)}`);
  console.log(
    `Actions: reach_out=${String(stats.reach_out)} monitor=${String(stats.monitor)} skip=${String(stats.skip)}`,
  );
  console.log(`Shortlist entries: ${String(shortlistCount)}`);
}

// Re-export RunStats for logSummary type
type RunStats = ReturnType<typeof computeRunStats>;
