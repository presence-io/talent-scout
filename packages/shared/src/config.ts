import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { resolveWorkspaceConfigPath } from './workspace.js';

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

const RankingSourceSchema = z.object({
  name: z.string(),
  type: z.enum(['github-readme', 'web-scrape']),
  repo: z.string().optional(),
  url: z.string().optional(),
  signal_type: z.enum(['seed:ranking', 'seed:list']),
  weight: z.number(),
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

const ClaudeAIConfigSchema = z.object({
  model: z.string().default('sonnet'),
  max_turns: z.number().default(1),
});

const MetaBotAIConfigSchema = z.object({
  url: z.string().default('http://localhost:9100'),
  secret: z.string().default(''),
  bot_name: z.string().default("Max's CC"),
  timeout: z.number().default(180000),
});

const AIConfigSchema = z.object({
  provider: z.enum(['claude', 'openclaw', 'metabot']).default('openclaw'),
  batch_size: z.number().default(10),
  claude: ClaudeAIConfigSchema.default({}),
  metabot: MetaBotAIConfigSchema.default({}),
});

const OpenClawAgentSchema = z.object({
  name: z.string(),
  workspace: z.string(),
  timeout: z.number().default(120),
});

const OpenClawChannelSchema = z.enum([
  'telegram',
  'whatsapp',
  'discord',
  'irc',
  'googlechat',
  'slack',
  'signal',
  'imessage',
  'line',
]);

const OpenClawDeliverySchema = z.object({
  channel: OpenClawChannelSchema,
  target: z.string(),
  account: z.string().optional(),
  thread_id: z.string().optional(),
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
  delivery: OpenClawDeliverySchema.optional(),
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
  ranking_sources: z.array(RankingSourceSchema).default([]),
  graph_expansion: GraphExpansionSchema.default({}),
  api_budget: ApiBudgetSchema.default({}),
  identity: IdentityConfigSchema.default({}),
  evaluation: EvaluationConfigSchema.default({}),
  target_profile: TargetProfileSchema.default({}),
  ai: AIConfigSchema.default({}),
  openclaw: OpenClawConfigSchema.default({}),
  cache: CacheConfigSchema.default({}),
});

export type TalentConfig = z.infer<typeof TalentConfigSchema>;

// ── Loader ──

let cachedConfig: TalentConfig | null = null;

export function resolveTalentConfigPath(base?: string): string {
  if (process.env['TALENT_CONFIG']) {
    return resolve(process.env['TALENT_CONFIG']);
  }

  const root = base ?? process.env['INIT_CWD'] ?? process.cwd();
  const workspaceConfigPath = resolveWorkspaceConfigPath(root);
  if (existsSync(workspaceConfigPath)) {
    return workspaceConfigPath;
  }

  return resolve(join(root, 'talents.yaml'));
}

export async function loadConfigFromPath(configPath: string): Promise<TalentConfig> {
  const raw = await readFile(resolve(configPath), 'utf-8');
  const parsed: unknown = parseYaml(raw);
  return TalentConfigSchema.parse(parsed);
}

/**
 * Load and validate talents.yaml from the project root.
 * Uses TALENT_CONFIG env var if set, otherwise prefers `workspace-data/talents.yaml`
 * and falls back to `$PWD/talents.yaml`.
 * Results are cached in-memory after the first load.
 */
export async function loadConfig(forceReload = false): Promise<TalentConfig> {
  if (cachedConfig && !forceReload) return cachedConfig;

  const configPath = resolveTalentConfigPath();
  cachedConfig = await loadConfigFromPath(configPath);
  return cachedConfig;
}

/** Reset cache (useful for testing). */
export function resetConfigCache(): void {
  cachedConfig = null;
}
