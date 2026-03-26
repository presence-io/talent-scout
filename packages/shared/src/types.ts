// ── Signal types ──

export type SignalType =
  | 'code:claude-md'
  | 'code:cursorrules'
  | 'code:cursor-rules'
  | 'code:cursor-rules-dir'
  | 'code:clinerules'
  | 'code:agents-md'
  | 'code:copilot-instructions'
  | 'code:windsurfrules'
  | 'commit:claude-coauthor'
  | 'commit:copilot-coauthor'
  | 'commit:cursor-generated'
  | 'commit:copilot-suggestion'
  | 'topic:claude-code'
  | 'topic:cursor-ai'
  | 'topic:ai-coding'
  | 'topic:mcp-server'
  | 'topic:mcp'
  | 'topic:copilot-extension'
  | 'topic:cursor'
  | 'community:stargazer'
  | 'community:fork'
  | 'community:contributor'
  | 'star:repo'
  | 'seed:ranking'
  | 'seed:list'
  | 'graph:follower';

export interface Signal {
  type: SignalType;
  detail: string;
  weight: number;
  source: string;
  repo?: string;
  /** Unique object ID for dedup (sha/filename/stargazer_id etc.) */
  object_id?: string;
  occurred_at?: string;
}

// ── GitHub Profile ──

export interface RepoSummary {
  name: string;
  full_name: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  is_fork: boolean;
  updated_at: string;
  ai_files?: string[];
}

export interface GitHubProfile {
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
  recent_repos: RepoSummary[];
}

// ── Identity ──

export interface IdentitySignal {
  tier: 1 | 2 | 3 | 4;
  type: string;
  confidence: number;
  evidence: string;
}

export interface IdentityResult {
  china_confidence: number;
  city: string | null;
  signals: IdentitySignal[];
  ai_assisted: boolean;
  inferred_at: string;
}

// ── Feature vectors ──

export interface SkillFeatures {
  total_stars_log: number;
  total_forks_log: number;
  owned_repo_count: number;
  max_repo_stars: number;
  active_months: number;
  recent_contributions: number;
  language_count: number;
  followers_log: number;
  fork_ratio: number;
  anti_pattern_penalty: number;
}

export interface AIDepthFeatures {
  ai_config_repo_count: number;
  ai_coauthor_commit_count: number;
  has_ai_builder_project: boolean;
  ai_project_stars: number;
  has_ai_community_maintenance: boolean;
  is_ai_coding_enthusiast: boolean;
}

export interface ReachabilityFeatures {
  has_email: boolean;
  has_blog: boolean;
  has_twitter: boolean;
  has_hireable: boolean;
  has_bio: boolean;
  has_chinese_community_profile: boolean;
}

export interface FitFeatures {
  city_bonus: number;
  language_match: boolean;
  is_too_senior: boolean;
}

export interface CandidateFeatures {
  skill: SkillFeatures;
  ai_depth: AIDepthFeatures;
  reachability: ReachabilityFeatures;
  fit: FitFeatures;
  recent_contributions: number;
}

// ── Evaluation ──

export type AIDepthTier = 'consumer' | 'user' | 'builder' | 'amplifier';
export type RecommendedAction = 'reach_out' | 'monitor' | 'skip';

export interface Evaluation {
  skill_score: number;
  skill_evidence: string[];
  ai_depth_score: number;
  ai_depth_tier: AIDepthTier;
  ai_depth_evidence: string[];
  reachability_score: number;
  reachability_evidence: string[];
  fit_score: number;
  fit_evidence: string[];
  final_score: number;
  recommended_action: RecommendedAction;
  summary: string;
  evaluated_at: string;
}

// ── Candidate ──

export interface Candidate {
  username: string;
  signals: Signal[];
  signal_score: number;
  is_ai_coding_enthusiast: boolean;
  profile?: GitHubProfile;
  identity?: IdentityResult;
  features?: CandidateFeatures;
  evaluation?: Evaluation;
}

// ── TalentEntry (final output) ──

export interface TalentEntry {
  username: string;
  name: string | null;
  city: string | null;
  company: string | null;
  email: string | null;
  blog: string | null;
  twitter: string | null;
  profile_url: string;
  china_confidence: number;
  skill_score: number;
  ai_depth_score: number;
  ai_depth_tier: string;
  reachability_score: number;
  fit_score: number;
  final_score: number;
  recommended_action: string;
  summary: string;
  signal_types: string[];
  signal_count: number;
}

// ── Ignore list ──

export interface IgnoreEntry {
  reason: string;
  ignored_at: string;
}

export type IgnoreList = Record<string, IgnoreEntry>;

// ── Cache ──

export interface CacheEntry<T> {
  data: T;
  fetched_at: string;
  expires_at: string;
}
