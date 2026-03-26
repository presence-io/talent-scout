import { evaluateCandidate, identifyCandidate } from '@talent-scout/data-processor';
import { Checkpoint, isIgnored, loadConfig, readIgnoreList } from '@talent-scout/shared';
import type { Candidate } from '@talent-scout/shared';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { deepEvaluateBatch } from './deep-eval.js';
import { inferIdentityBatch } from './identity-ai.js';
import { produceShortlist } from './shortlist.js';
import { appendSkillsPending, computeRunStats, writeStatsJson } from './skills.js';

export interface PipelineOptions {
  /** Directory containing merged.json and profiles.json */
  inputDir: string;
  /** Directory to write evaluation output and shortlist */
  outputDir: string;
  /** Path to ignore-list.json */
  ignoreListPath?: string;
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

/** Load merged candidates from merged.json. */
async function loadCandidates(inputDir: string): Promise<Candidate[]> {
  const raw = await readFile(join(inputDir, 'merged.json'), 'utf-8');
  const data = JSON.parse(raw) as MergedData;
  return Object.values(data);
}

/** Attach profiles from profiles.json to candidates. */
async function attachProfiles(candidates: Candidate[], inputDir: string): Promise<void> {
  const raw = await readFile(join(inputDir, 'profiles.json'), 'utf-8');
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
 *
 * A checkpoint file in the output directory allows the pipeline to resume
 * after interruption — expensive AI batch calls are skipped for usernames
 * that were already processed.
 */
export async function runPipeline(options: PipelineOptions): Promise<void> {
  const config = await loadConfig();
  const minConfidence = config.identity.min_confidence;

  await mkdir(options.outputDir, { recursive: true });
  const checkpoint = new Checkpoint(join(options.outputDir, '_checkpoint.json'));
  await checkpoint.load();

  // Step 1: Load data
  let candidates = await loadCandidates(options.inputDir);
  await attachProfiles(candidates, options.inputDir);

  // Step 1b: Filter out ignored users
  const ignoreList = await readIgnoreList(options.ignoreListPath);
  candidates = candidates.filter((c) => !isIgnored(ignoreList, c.username));

  // Step 2: Identity detection (rule-based)
  for (const c of candidates) {
    c.identity = identifyCandidate(c);
  }

  // Step 2b: AI identity inference for gray-area candidates
  if (!options.skipAI) {
    await inferIdentityBatch(candidates, config, checkpoint);
  }

  // Step 3: Rule-based evaluation for identified Chinese developers
  const identified = candidates.filter(
    (candidate) => (candidate.identity?.china_confidence ?? 0) >= minConfidence
  );
  for (const c of identified) {
    c.evaluation = evaluateCandidate(c, config);
  }

  // Step 4: AI deep evaluation for top candidates
  if (!options.skipAI) {
    await deepEvaluateBatch(identified, config, checkpoint);
  }

  // Step 5: Produce shortlist
  const shortlist = produceShortlist(identified);

  // Step 6: Write output
  await writeOutput(options.outputDir, candidates, shortlist);

  // Step 7: Update SKILLS-pending + stats.json
  const stats = computeRunStats(candidates, minConfidence);
  const parentDir = dirname(options.outputDir);
  await appendSkillsPending(parentDir, stats);
  await writeStatsJson(parentDir, stats);

  // Pipeline complete — remove checkpoint
  await checkpoint.remove();

  logSummary(stats, shortlist.length);
}

async function writeOutput(
  outputDir: string,
  candidates: Candidate[],
  shortlist: ReturnType<typeof produceShortlist>
): Promise<void> {
  const evaluated: Record<string, Candidate> = {};
  for (const c of candidates) {
    evaluated[c.username] = c;
  }

  await writeFile(join(outputDir, 'evaluation.json'), JSON.stringify(evaluated, null, 2));
  await writeFile(join(outputDir, 'shortlist.json'), JSON.stringify(shortlist, null, 2));
}

function logSummary(stats: RunStats, shortlistCount: number): void {
  console.log('=== Evaluation Pipeline Complete ===');
  console.log(`Candidates: ${String(stats.total_candidates)}`);
  console.log(`Identified Chinese: ${String(stats.identified_chinese)}`);
  console.log(`Evaluated: ${String(stats.evaluated)}`);
  console.log(
    `Actions: reach_out=${String(stats.reach_out)} monitor=${String(stats.monitor)} skip=${String(stats.skip)}`
  );
  console.log(`Shortlist entries: ${String(shortlistCount)}`);
}

// Re-export RunStats for logSummary type
type RunStats = ReturnType<typeof computeRunStats>;
