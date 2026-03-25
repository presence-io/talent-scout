import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// ── Zod schemas matching talents.yaml structure ──

const CodeSignalSchema = z.object({
  filename: z.string(),
  path: z.string(),
  weight: z.number(),
  label: z.string(),
});

const CommitQuerySchema = z.object({
  query: z.string(),
  weight: z.number(),
  label: z.string(),
});

const TopicQuerySchema = z.object({
  topic: z.string(),
  weight: z.number(),
  max_pages: z.number().optional(),
});

const CommunityRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  type: z.enum(['stargazers', 'forks', 'contributors']),
  weight: z.number(),
  max_pages: z.number().default(10),
});

const StargazerRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  weight: z.number(),
  max_pages: z.number().default(10),
});

const GraphExpansionSchema = z.object({
  enabled: z.boolean().default(true),
  max_seed_users: z.number().default(200),
  max_followers_per_user: z.number().default(100),
  max_depth: z.number().default(1),
  min_seed_confidence: z.number().default(0.7),
});

const ApiBudgetSchema = z.object({
  max_total_calls: z.number().default(2000),
  search_pages_per_query: z.number().default(10),
  profile_batch_size: z.number().default(500),
  search_sleep_ms: z.number().default(2500),
});

const IdentityConfigSchema = z.object({
  min_confidence: z.number().default(0.5),
  ai_assist_range: z.tuple([z.number(), z.number()]).default([0.3, 0.7]),
});

const EvaluationWeightsSchema = z.object({
  skill: z.number().default(0.35),
  ai_depth: z.number().default(0.3),
  reachability: z.number().default(0.15),
  fit: z.number().default(0.2),
});

const EvaluationConfigSchema = z.object({
  weights: EvaluationWeightsSchema.default({}),
  activity_penalty: z.number().default(-3.0),
  activity_threshold: z.number().default(10),
  max_ai_evaluations: z.number().default(200),
});

const CityBonusSchema = z.object({
  name: z.string(),
  bonus: z.number(),
});

const TargetProfileSchema = z.object({
  preferred_cities: z.array(CityBonusSchema).default([]),
  preferred_languages: z.array(z.string()).default([]),
});

const OpenClawAgentSchema = z.object({
  name: z.string(),
  workspace: z.string(),
  timeout: z.number().default(120),
});

const CronJobSchema = z.object({
  name: z.string(),
  schedule: z.string(),
  command: z.string(),
  description: z.string().optional(),
});

const OpenClawConfigSchema = z.object({
  agents: z.record(z.string(), OpenClawAgentSchema).default({}),
  batch_size: z.number().default(10),
  cron: z.array(CronJobSchema).default([]),
});

const CacheTtlSchema = z.object({
  user_profile: z.number().default(604800),
  user_repos: z.number().default(259200),
  search_results: z.number().default(86400),
  events: z.number().default(43200),
  rankings: z.number().default(2592000),
});

const CacheConfigSchema = z.object({
  ttl: CacheTtlSchema.default({}),
});

export const TalentConfigSchema = z.object({
  code_signals: z.array(CodeSignalSchema).default([]),
  commit_queries: z.array(CommitQuerySchema).default([]),
  topic_queries: z.array(TopicQuerySchema).default([]),
  chinese_community: z.array(CommunityRepoSchema).default([]),
  stargazer_repos: z.array(StargazerRepoSchema).default([]),
  graph_expansion: GraphExpansionSchema.default({}),
  api_budget: ApiBudgetSchema.default({}),
  identity: IdentityConfigSchema.default({}),
  evaluation: EvaluationConfigSchema.default({}),
  target_profile: TargetProfileSchema.default({}),
  openclaw: OpenClawConfigSchema.default({}),
  cache: CacheConfigSchema.default({}),
});

export type TalentConfig = z.infer<typeof TalentConfigSchema>;

// ── Loader ──

let cachedConfig: TalentConfig | null = null;

/**
 * Load and validate talents.yaml from the project root.
 * Uses TALENT_CONFIG env var if set, otherwise defaults to `$PWD/talents.yaml`.
 * Results are cached in-memory after the first load.
 */
export async function loadConfig(forceReload = false): Promise<TalentConfig> {
  if (cachedConfig && !forceReload) return cachedConfig;

  const configPath = resolve(process.env['TALENT_CONFIG'] ?? 'talents.yaml');
  const raw = await readFile(configPath, 'utf-8');
  const parsed: unknown = parseYaml(raw);
  cachedConfig = TalentConfigSchema.parse(parsed);
  return cachedConfig;
}

/** Reset cache (useful for testing). */
export function resetConfigCache(): void {
  cachedConfig = null;
}
