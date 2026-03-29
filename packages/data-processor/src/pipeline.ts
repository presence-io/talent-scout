import {
  type Candidate,
  Checkpoint,
  FileCache,
  type GitHubProfile,
  type RepoSummary,
  type Signal,
  type TalentConfig,
  findOrCreateRunDir,
  ghApi,
  ghApiSingle,
  isIgnored,
  loadConfig,
  readIgnoreList,
  resolveCacheDir,
  resolveOutputDir,
  resolveUserDataDir,
} from '@talent-scout/shared';
import { existsSync } from 'node:fs';
import { readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { identifyCandidate } from './identity.js';
import { mergeCandidateRecords } from './merge.js';
import { evaluateCandidate } from './scoring.js';

interface RawCollectionFile {
  candidates: Record<string, Signal[]>;
}

interface GitHubUserResponse {
  login: string;
  name: string | null;
  location: string | null;
  email: string | null;
  blog: string | null;
  twitter_username: string | null;
  bio: string | null;
  company: string | null;
  hireable: boolean | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics?: string[];
  fork: boolean;
  updated_at: string;
}

export interface ProcessPipelineOptions {
  baseDir?: string;
  rawDir?: string;
}

export interface ProcessPipelineResult {
  outputDir: string;
  rawDir: string;
  candidateCount: number;
  identifiedCount: number;
  fetchedProfiles: number;
}

function identityThreshold(config: TalentConfig): number {
  return config.identity.min_confidence;
}

async function findLatestRawDir(baseDir?: string): Promise<string> {
  const rawDir = join(resolveOutputDir(baseDir), 'raw');
  const entries = await readdir(rawDir, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  if (dirs.length === 0) {
    throw new Error(`No raw data directories found in ${rawDir}`);
  }

  const latestDir = dirs[0];
  if (!latestDir) {
    throw new Error(`No raw data directories found in ${rawDir}`);
  }

  return join(rawDir, latestDir);
}

async function loadRawSignals(rawDir: string): Promise<Record<string, Signal[]>> {
  const files = await readdir(rawDir);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));

  const merged: Record<string, Signal[]> = {};
  for (const file of jsonFiles) {
    const raw = await readFile(join(rawDir, file), 'utf-8');
    const data = JSON.parse(raw) as RawCollectionFile;
    for (const [username, signals] of Object.entries(data.candidates)) {
      const existing = merged[username] ?? [];
      existing.push(...signals);
      merged[username] = existing;
    }
  }

  return merged;
}

function isBotCandidate(candidate: Candidate): boolean {
  return candidate.username.endsWith('[bot]') || candidate.username.includes('dependabot');
}

function hydrationPriority(candidate: Candidate): number {
  const hasSeedSignal = candidate.signals.some((signal) => signal.type.startsWith('seed:'));
  const hasCommunitySignal = candidate.signals.some((signal) =>
    signal.type.startsWith('community:')
  );
  const hasAISignal = candidate.signals.some(
    (signal) => signal.type.startsWith('code:') || signal.type.startsWith('commit:')
  );

  return (hasSeedSignal ? 1000 : 0) + (hasCommunitySignal ? 200 : 0) + (hasAISignal ? 100 : 0);
}

function selectCandidatesForProfileHydration(
  candidates: Candidate[],
  config: TalentConfig
): Candidate[] {
  const limit = Math.max(1, config.api_budget.profile_batch_size);

  return [...candidates]
    .filter((candidate) => !isBotCandidate(candidate))
    .sort((left, right) => {
      const priorityDiff = hydrationPriority(right) - hydrationPriority(left);
      if (priorityDiff !== 0) return priorityDiff;

      const scoreDiff = right.signal_score - left.signal_score;
      if (scoreDiff !== 0) return scoreDiff;

      return left.username.localeCompare(right.username);
    })
    .slice(0, limit);
}

function toRepoSummary(repo: GitHubRepoResponse): RepoSummary {
  return {
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    language: repo.language,
    topics: repo.topics ?? [],
    is_fork: repo.fork,
    updated_at: repo.updated_at,
  };
}

async function fetchGitHubProfile(
  username: string,
  config: TalentConfig,
  cache: FileCache
): Promise<GitHubProfile | null> {
  const user = await ghApiSingle<GitHubUserResponse>(`/users/${username}`, {
    cache,
    cacheTtl: config.cache.ttl.user_profile,
  });

  if (!user) {
    return null;
  }

  const repos = await ghApi<GitHubRepoResponse>(
    `/users/${username}/repos?sort=updated&direction=desc`,
    {
      perPage: 20,
      maxPages: 1,
      sleepMs: config.api_budget.search_sleep_ms,
      cache,
      cacheTtl: config.cache.ttl.user_repos,
    }
  );

  return {
    login: user.login,
    name: user.name,
    location: user.location,
    email: user.email,
    blog: user.blog,
    twitter: user.twitter_username,
    bio: user.bio,
    company: user.company,
    hireable: user.hireable,
    public_repos: user.public_repos,
    followers: user.followers,
    following: user.following,
    created_at: user.created_at,
    updated_at: user.updated_at,
    recent_repos: repos.map(toRepoSummary),
  };
}

/** Persist interval: save checkpoint every N profiles fetched. */
const HYDRATION_CHECKPOINT_INTERVAL = 50;

async function hydrateCandidateProfiles(
  candidates: Candidate[],
  config: TalentConfig,
  checkpoint: Checkpoint,
  baseDir?: string
): Promise<Record<string, GitHubProfile>> {
  const cache = new FileCache(resolve(resolveCacheDir(baseDir), 'github'));
  const selected = selectCandidatesForProfileHydration(candidates, config);
  const profiles: Record<string, GitHubProfile> = {};

  // Resume: load already-fetched usernames from checkpoint
  const done = new Set((checkpoint.get('hydration_done') as string[] | undefined) ?? []);

  // Restore profiles for already-done candidates (from cache)
  if (done.size > 0) {
    console.log(`      Resuming: skipping ${String(done.size)} already fetched`);
    for (const candidate of selected) {
      if (done.has(candidate.username)) {
        const profile = await fetchGitHubProfile(candidate.username, config, cache);
        if (profile) {
          candidate.profile = profile;
          profiles[candidate.username] = profile;
        }
      }
    }
  }

  const remaining = selected.filter((c) => !done.has(c.username));
  let sinceLastCheckpoint = 0;

  for (const candidate of remaining) {
    const profile = await fetchGitHubProfile(candidate.username, config, cache);
    if (!profile) {
      done.add(candidate.username);
      sinceLastCheckpoint++;
      continue;
    }
    candidate.profile = profile;
    profiles[candidate.username] = profile;
    done.add(candidate.username);
    sinceLastCheckpoint++;

    if (sinceLastCheckpoint >= HYDRATION_CHECKPOINT_INTERVAL) {
      await checkpoint.mark('hydration_done', [...done]);
      sinceLastCheckpoint = 0;
    }
  }

  // Final checkpoint persist
  if (sinceLastCheckpoint > 0) {
    await checkpoint.mark('hydration_done', [...done]);
  }

  return profiles;
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(data, null, 2));
  await rename(tmpPath, filePath);
}

export async function runProcessPipeline(
  options: ProcessPipelineOptions = {}
): Promise<ProcessPipelineResult> {
  console.log('    Loading config and ignore list...');
  const config = await loadConfig();
  const outputBase = resolveOutputDir(options.baseDir);
  const ignoreList = await readIgnoreList(
    join(resolveUserDataDir(options.baseDir), 'ignore-list.json')
  );
  const rawDir = options.rawDir ?? (await findLatestRawDir(options.baseDir));
  console.log(`    ✓ Raw data from: ${rawDir}`);

  // Use findOrCreateRunDir to resume incomplete runs
  const processedBase = resolve(outputBase, 'processed');
  const processedDir = await findOrCreateRunDir(processedBase);

  // Initialize checkpoint
  const checkpoint = new Checkpoint(join(processedDir, '_checkpoint.json'));
  await checkpoint.load();

  // ── Step 1: Load & merge raw signals (always re-run, fast) ──
  console.log('    Loading and merging raw signals...');
  const rawSignals = await loadRawSignals(rawDir);
  console.log(`    ✓ Loaded ${String(Object.keys(rawSignals).length)} users from raw files`);

  const candidateMap = mergeCandidateRecords(rawSignals);
  console.log(`    ✓ Merged & deduped: ${String(candidateMap.size)} candidates`);

  const candidates: Candidate[] = [];
  let ignoredCount = 0;
  for (const [username, candidate] of candidateMap) {
    if (isIgnored(ignoreList, username)) {
      ignoredCount++;
      continue;
    }
    candidates.push(candidate);
  }
  if (ignoredCount > 0) {
    console.log(`    ✓ Filtered out ${String(ignoredCount)} ignored users → ${String(candidates.length)} remaining`);
  }

  // ── Step 2: Profile hydration (expensive, checkpointed per-user) ──
  let profiles: Record<string, GitHubProfile>;
  if (checkpoint.isComplete('hydration_complete')) {
    console.log('    Hydrating GitHub profiles... (resuming from checkpoint)');
    const raw = await readFile(join(processedDir, 'profiles.json'), 'utf-8');
    profiles = JSON.parse(raw) as Record<string, GitHubProfile>;
    // Re-attach profiles to candidates
    for (const candidate of candidates) {
      const p = profiles[candidate.username];
      if (p) candidate.profile = p;
    }
    console.log(`    ✓ Loaded ${String(Object.keys(profiles).length)} profiles from checkpoint`);
  } else {
    console.log(`    Hydrating GitHub profiles (batch_size=${String(config.api_budget.profile_batch_size)})...`);
    const t1 = Date.now();
    profiles = await hydrateCandidateProfiles(candidates, config, checkpoint, options.baseDir);
    console.log(`    ✓ Fetched ${String(Object.keys(profiles).length)} profiles (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
    await writeJsonAtomic(join(processedDir, 'profiles.json'), profiles);
    console.log('      → profiles.json');
    await checkpoint.mark('hydration_complete');
  }

  // ── Step 3: Identity detection (fast, checkpointed at step level) ──
  if (checkpoint.isComplete('identity_complete')) {
    console.log('    Running identity detection... (resuming from checkpoint)');
    const raw = await readFile(join(processedDir, 'identity.json'), 'utf-8');
    const identityData = JSON.parse(raw) as Record<string, Candidate['identity']>;
    for (const candidate of candidates) {
      const id = identityData[candidate.username];
      if (id) candidate.identity = id;
    }
    console.log(`    ✓ Loaded identity for ${String(Object.keys(identityData).length)} candidates from checkpoint`);
  } else {
    console.log('    Running identity detection (rule-based)...');
    for (const candidate of candidates) {
      candidate.identity = identifyCandidate(candidate);
    }
    const identityOutput: Record<string, Candidate['identity']> = {};
    for (const candidate of candidates) {
      if (candidate.identity) {
        identityOutput[candidate.username] = candidate.identity;
      }
    }
    await writeJsonAtomic(join(processedDir, 'identity.json'), identityOutput);
    console.log('      → identity.json');
    await checkpoint.mark('identity_complete');
  }

  const identified = candidates.filter(
    (candidate) => (candidate.identity?.china_confidence ?? 0) >= identityThreshold(config)
  );
  console.log(`    ✓ Identified ${String(identified.length)}/${String(candidates.length)} candidates (threshold=${String(identityThreshold(config))})`);

  // ── Step 4: Scoring (fast, checkpointed at step level) ──
  if (checkpoint.isComplete('scoring_complete')) {
    console.log('    Running rule-based scoring... (resuming from checkpoint)');
    const raw = await readFile(join(processedDir, 'scored.json'), 'utf-8');
    const scoredData = JSON.parse(raw) as Record<string, Candidate>;
    for (const candidate of identified) {
      const scored = scoredData[candidate.username];
      if (scored?.evaluation) candidate.evaluation = scored.evaluation;
    }
    console.log('    ✓ Loaded scoring from checkpoint');
  } else {
    console.log('    Running rule-based scoring for identified candidates...');
    for (const candidate of identified) {
      candidate.evaluation = evaluateCandidate(candidate, config);
    }
    const scoredOutput: Record<string, Candidate> = {};
    for (const candidate of identified) {
      scoredOutput[candidate.username] = candidate;
    }
    await writeJsonAtomic(join(processedDir, 'scored.json'), scoredOutput);
    console.log('      → scored.json');
    await checkpoint.mark('scoring_complete');
  }

  const reachOut = identified.filter((c) => c.evaluation?.recommended_action === 'reach_out').length;
  const monitor = identified.filter((c) => c.evaluation?.recommended_action === 'monitor').length;
  const skip = identified.filter((c) => c.evaluation?.recommended_action === 'skip').length;
  console.log(`    ✓ Scored: reach_out=${String(reachOut)} monitor=${String(monitor)} skip=${String(skip)}`);

  // ── Step 5: Write final outputs ──
  console.log('    Writing output files...');
  const mergedOutput: Record<string, Candidate> = {};
  for (const candidate of candidates) {
    mergedOutput[candidate.username] = candidate;
  }
  await writeJsonAtomic(join(processedDir, 'merged.json'), mergedOutput);
  console.log('      → merged.json');

  // Write profiles/identity/scored if not already written by checkpoint steps
  if (!existsSync(join(processedDir, 'profiles.json'))) {
    await writeJsonAtomic(join(processedDir, 'profiles.json'), profiles);
    console.log('      → profiles.json');
  }
  if (!existsSync(join(processedDir, 'identity.json'))) {
    const identityOutput: Record<string, Candidate['identity']> = {};
    for (const candidate of candidates) {
      if (candidate.identity) identityOutput[candidate.username] = candidate.identity;
    }
    await writeJsonAtomic(join(processedDir, 'identity.json'), identityOutput);
    console.log('      → identity.json');
  }
  if (!existsSync(join(processedDir, 'scored.json'))) {
    const scoredOutput: Record<string, Candidate> = {};
    for (const candidate of identified) {
      scoredOutput[candidate.username] = candidate;
    }
    await writeJsonAtomic(join(processedDir, 'scored.json'), scoredOutput);
    console.log('      → scored.json');
  }

  // Mark complete and clean up checkpoint
  await writeFile(join(processedDir, '.complete'), new Date().toISOString());
  await checkpoint.remove();
  console.log('    ✓ Checkpoint cleaned up');

  const latestLink = resolve(outputBase, 'processed', 'latest');
  try {
    await rm(latestLink, { force: true });
  } catch {
    // Ignore if latest symlink is absent.
  }
  await symlink(processedDir, latestLink);
  console.log('    ✓ Updated latest symlink');

  return {
    outputDir: processedDir,
    rawDir,
    candidateCount: candidates.length,
    identifiedCount: identified.length,
    fetchedProfiles: Object.keys(profiles).length,
  };
}
