import {
  type Candidate,
  FileCache,
  type GitHubProfile,
  type RepoSummary,
  type Signal,
  type TalentConfig,
  ghApi,
  ghApiSingle,
  isIgnored,
  loadConfig,
  readIgnoreList,
  resolveCacheDir,
  resolveOutputDir,
  resolveUserDataDir,
} from '@talent-scout/shared';
import { mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
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

async function hydrateCandidateProfiles(
  candidates: Candidate[],
  config: TalentConfig,
  baseDir?: string
): Promise<Record<string, GitHubProfile>> {
  const cache = new FileCache(resolve(resolveCacheDir(baseDir), 'github'));
  const selected = selectCandidatesForProfileHydration(candidates, config);
  const profiles: Record<string, GitHubProfile> = {};

  for (const candidate of selected) {
    const profile = await fetchGitHubProfile(candidate.username, config, cache);
    if (!profile) {
      continue;
    }
    candidate.profile = profile;
    profiles[candidate.username] = profile;
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
  const config = await loadConfig();
  const outputBase = resolveOutputDir(options.baseDir);
  const ignoreList = await readIgnoreList(
    join(resolveUserDataDir(options.baseDir), 'ignore-list.json')
  );
  const rawDir = options.rawDir ?? (await findLatestRawDir(options.baseDir));

  const rawSignals = await loadRawSignals(rawDir);
  const candidateMap = mergeCandidateRecords(rawSignals);
  const candidates: Candidate[] = [];

  for (const [username, candidate] of candidateMap) {
    if (isIgnored(ignoreList, username)) {
      continue;
    }
    candidates.push(candidate);
  }

  const profiles = await hydrateCandidateProfiles(candidates, config, options.baseDir);

  for (const candidate of candidates) {
    candidate.identity = identifyCandidate(candidate);
  }

  const identified = candidates.filter(
    (candidate) => (candidate.identity?.china_confidence ?? 0) >= identityThreshold(config)
  );
  for (const candidate of identified) {
    candidate.evaluation = evaluateCandidate(candidate, config);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const processedDir = resolve(outputBase, 'processed', timestamp);
  await mkdir(processedDir, { recursive: true });

  const mergedOutput: Record<string, Candidate> = {};
  for (const candidate of candidates) {
    mergedOutput[candidate.username] = candidate;
  }
  await writeJsonAtomic(join(processedDir, 'merged.json'), mergedOutput);
  await writeJsonAtomic(join(processedDir, 'profiles.json'), profiles);

  const identityOutput: Record<string, Candidate['identity']> = {};
  for (const candidate of candidates) {
    if (candidate.identity) {
      identityOutput[candidate.username] = candidate.identity;
    }
  }
  await writeJsonAtomic(join(processedDir, 'identity.json'), identityOutput);

  const scoredOutput: Record<string, Candidate> = {};
  for (const candidate of identified) {
    scoredOutput[candidate.username] = candidate;
  }
  await writeJsonAtomic(join(processedDir, 'scored.json'), scoredOutput);

  const latestLink = resolve(outputBase, 'processed', 'latest');
  try {
    await rm(latestLink, { force: true });
  } catch {
    // Ignore if latest symlink is absent.
  }
  await symlink(processedDir, latestLink);

  return {
    outputDir: processedDir,
    rawDir,
    candidateCount: candidates.length,
    identifiedCount: identified.length,
    fetchedProfiles: Object.keys(profiles).length,
  };
}
