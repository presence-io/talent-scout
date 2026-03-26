import {
  type AIDepthFeatures,
  type AIDepthTier,
  type Candidate,
  type CandidateFeatures,
  type Evaluation,
  type FitFeatures,
  type GitHubProfile,
  type ReachabilityFeatures,
  type RecommendedAction,
  type SkillFeatures,
  type TalentConfig,
} from '@talent-scout/shared';

// ── Skill Score ──

export function extractSkillFeatures(profile: GitHubProfile): SkillFeatures {
  const repos = profile.recent_repos;
  const ownedRepos = repos.filter((r) => !r.is_fork);

  const totalStars = repos.reduce((sum, r) => sum + r.stars, 0);
  const totalForks = repos.reduce((sum, r) => sum + r.forks, 0);
  const maxStars = repos.reduce((max, r) => Math.max(max, r.stars), 0);

  const languages = new Set(repos.map((r) => r.language).filter(Boolean));

  // Estimate active months from recent repos' updated_at dates
  const now = Date.now();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  const recentMonths = new Set<string>();
  for (const r of repos) {
    const updated = new Date(r.updated_at).getTime();
    if (now - updated < oneYear) {
      const d = new Date(r.updated_at);
      recentMonths.add(`${String(d.getFullYear())}-${String(d.getMonth())}`);
    }
  }

  const forkCount = repos.filter((r) => r.is_fork).length;
  const forkRatio = repos.length > 0 ? forkCount / repos.length : 0;

  return {
    total_stars_log: Math.log10(totalStars + 1),
    total_forks_log: Math.log10(totalForks + 1),
    owned_repo_count: ownedRepos.length,
    max_repo_stars: maxStars,
    active_months: recentMonths.size,
    // Estimate recent contributions from active months and repo count.
    // TODO: Replace with actual Events API data (commit/PR/issue/review counts).
    recent_contributions: recentMonths.size * 4 + ownedRepos.length,
    language_count: languages.size,
    followers_log: Math.log10(profile.followers + 1),
    fork_ratio: forkRatio,
    anti_pattern_penalty: detectAntiPatternPenalty(repos),
  };
}

function detectAntiPatternPenalty(repos: GitHubProfile['recent_repos']): number {
  const hotTopics = ['langchain', 'llamaindex', 'autogpt', 'rag', 'agent'];
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const recentRepos = repos.filter((r) => now - new Date(r.updated_at).getTime() < oneYear);
  const hotCount = recentRepos.filter((r) => {
    const text = `${r.name} ${r.description ?? ''}`.toLowerCase();
    return hotTopics.some((t) => text.includes(t));
  }).length;

  return hotCount >= 5 ? -2 : 0;
}

export function computeSkillScore(f: SkillFeatures): number {
  const raw =
    Math.min(f.total_stars_log / 4, 1.0) * 3.0 +
    Math.min(f.owned_repo_count / 20, 1.0) * 1.5 +
    Math.min(f.active_months / 12, 1.0) * 2.0 +
    Math.min(f.language_count / 5, 1.0) * 0.5 +
    Math.min(f.followers_log / 3, 1.0) * 1.5 +
    (f.fork_ratio > 0.7 ? -1.5 : 0) +
    f.anti_pattern_penalty;
  return Math.max(1, Math.min(10, raw + 1.5));
}

// ── AI Depth Score ──

export function extractAIDepthFeatures(
  candidate: Candidate,
  profile: GitHubProfile,
): AIDepthFeatures {
  const signals = candidate.signals;

  const aiConfigCount = signals.filter((s) => s.type.startsWith('code:')).length;
  const aiCoauthorCount = signals.filter((s) => s.type.startsWith('commit:')).length;

  const aiTopics = ['mcp-server', 'mcp', 'ai-agent', 'llm', 'langchain'];
  const hasBuilderProject = profile.recent_repos.some(
    (r) => !r.is_fork && r.stars >= 10 && r.topics.some((t) => aiTopics.includes(t)),
  );

  const aiProjectStars = profile.recent_repos
    .filter((r) => r.topics.some((t) => aiTopics.includes(t)))
    .reduce((sum, r) => sum + r.stars, 0);

  const hasCommunityMaintenance = signals.some((s) => s.type === 'community:contributor');

  return {
    ai_config_repo_count: aiConfigCount,
    ai_coauthor_commit_count: aiCoauthorCount,
    has_ai_builder_project: hasBuilderProject,
    ai_project_stars: aiProjectStars,
    has_ai_community_maintenance: hasCommunityMaintenance,
    is_ai_coding_enthusiast: candidate.is_ai_coding_enthusiast,
  };
}

export function computeAIDepthScore(f: AIDepthFeatures): {
  score: number;
  tier: AIDepthTier;
} {
  if (f.has_ai_community_maintenance && f.ai_config_repo_count >= 3) {
    return { score: 9.5, tier: 'amplifier' };
  }
  if (f.has_ai_builder_project) {
    const bonus = Math.min(f.ai_project_stars / 500, 1.0) * 0.5;
    return { score: 7.5 + bonus, tier: 'builder' };
  }
  if (f.ai_config_repo_count > 0 || f.ai_coauthor_commit_count > 0) {
    const configBonus = Math.min(f.ai_config_repo_count / 3, 1.0) * 1.0;
    return { score: 4.5 + configBonus, tier: 'user' };
  }
  return { score: 2, tier: 'consumer' };
}

// ── Reachability Score ──

export function extractReachabilityFeatures(profile: GitHubProfile): ReachabilityFeatures {
  const text = [profile.blog ?? '', profile.bio ?? ''].join(' ').toLowerCase();
  const hasChinese = /zhihu\.com|juejin\.cn|csdn\.net|cnblogs\.com|bilibili\.com|v2ex\.com/.test(
    text,
  );

  return {
    has_email: profile.email !== null && profile.email !== '',
    has_blog: profile.blog !== null && profile.blog !== '',
    has_twitter: profile.twitter !== null && profile.twitter !== '',
    has_hireable: profile.hireable === true,
    has_bio: profile.bio !== null && profile.bio !== '',
    has_chinese_community_profile: hasChinese,
  };
}

export function computeReachabilityScore(f: ReachabilityFeatures): number {
  let score = 1;
  if (f.has_email) score += 3;
  if (f.has_blog) score += 2;
  if (f.has_twitter) score += 1;
  if (f.has_hireable) score += 1;
  if (f.has_chinese_community_profile) score += 1.5;
  if (f.has_bio) score += 0.5;
  return Math.min(10, score);
}

// ── Fit Score ──

export function extractFitFeatures(
  profile: GitHubProfile,
  city: string | null,
  config: TalentConfig,
): FitFeatures {
  const cityBonus = city
    ? (config.target_profile.preferred_cities.find(
        (c) => c.name.toLowerCase() === city.toLowerCase(),
      )?.bonus ?? 0)
    : 0;

  const primaryLanguages = new Set(
    profile.recent_repos.filter((r) => !r.is_fork && r.language).map((r) => r.language),
  );
  const languageMatch = config.target_profile.preferred_languages.some((l) =>
    primaryLanguages.has(l),
  );

  const isTooSenior = profile.followers > 10_000 || extractTotalStars(profile) > 50_000;

  return {
    city_bonus: cityBonus,
    language_match: languageMatch,
    is_too_senior: isTooSenior,
  };
}

function extractTotalStars(profile: GitHubProfile): number {
  return profile.recent_repos.reduce((sum, r) => sum + r.stars, 0);
}

export function computeFitScore(f: FitFeatures): number {
  let score = 5;
  score += f.city_bonus;
  if (f.language_match) score += 1.5;
  if (f.is_too_senior) score -= 3;
  return Math.max(1, Math.min(10, score));
}

// ── Final Score ──

export function computeFinalScore(
  scores: { skill: number; ai_depth: number; reachability: number; fit: number },
  config: TalentConfig,
  recentContributions: number,
): number {
  const w = config.evaluation.weights;
  const weighted =
    scores.skill * w.skill +
    scores.ai_depth * w.ai_depth +
    scores.reachability * w.reachability +
    scores.fit * w.fit;

  const activityPenalty =
    recentContributions < config.evaluation.activity_threshold
      ? config.evaluation.activity_penalty
      : 0;

  return Math.max(0, weighted + activityPenalty);
}

export function determineAction(
  finalScore: number,
  reachability: number,
  skill: number,
  aiDepth: number,
): RecommendedAction {
  if (skill <= 3 && aiDepth <= 3) return 'skip';
  if (finalScore >= 7.0 && reachability >= 5) return 'reach_out';
  if (finalScore >= 5.0) return 'monitor';
  return 'skip';
}

// ── Full Evaluation ──

export function evaluateCandidate(candidate: Candidate, config: TalentConfig): Evaluation {
  const profile = candidate.profile;
  if (!profile) {
    return emptyEvaluation();
  }

  const city = candidate.identity?.city ?? null;

  // Extract features
  const skillF = extractSkillFeatures(profile);
  const aiDepthF = extractAIDepthFeatures(candidate, profile);
  const reachF = extractReachabilityFeatures(profile);
  const fitF = extractFitFeatures(profile, city, config);

  // Compute scores
  const skillScore = computeSkillScore(skillF);
  const { score: aiDepthScore, tier: aiDepthTier } = computeAIDepthScore(aiDepthF);
  const reachScore = computeReachabilityScore(reachF);
  const fitScore = computeFitScore(fitF);

  const finalScore = computeFinalScore(
    { skill: skillScore, ai_depth: aiDepthScore, reachability: reachScore, fit: fitScore },
    config,
    skillF.recent_contributions,
  );

  const action = determineAction(finalScore, reachScore, skillScore, aiDepthScore);

  // Store features on candidate
  const features: CandidateFeatures = {
    skill: skillF,
    ai_depth: aiDepthF,
    reachability: reachF,
    fit: fitF,
    recent_contributions: skillF.recent_contributions,
  };
  candidate.features = features;

  return {
    skill_score: round2(skillScore),
    skill_evidence: buildSkillEvidence(skillF),
    ai_depth_score: round2(aiDepthScore),
    ai_depth_tier: aiDepthTier,
    ai_depth_evidence: buildAIDepthEvidence(aiDepthF),
    reachability_score: round2(reachScore),
    reachability_evidence: buildReachabilityEvidence(reachF),
    fit_score: round2(fitScore),
    fit_evidence: buildFitEvidence(fitF, city),
    final_score: round2(finalScore),
    recommended_action: action,
    summary: buildSummary(candidate.username, action, finalScore),
    evaluated_at: new Date().toISOString(),
  };
}

// ── Evidence Builders ──

function buildSkillEvidence(f: SkillFeatures): string[] {
  const evidence: string[] = [];
  if (f.total_stars_log > 2)
    evidence.push(`High star count (log: ${String(round2(f.total_stars_log))})`);
  evidence.push(`${String(f.owned_repo_count)} owned repos`);
  evidence.push(`Active ${String(f.active_months)}/12 months`);
  if (f.fork_ratio > 0.7) evidence.push('High fork ratio (penalty applied)');
  if (f.anti_pattern_penalty < 0) evidence.push('Hype-chaser pattern detected');
  return evidence;
}

function buildAIDepthEvidence(f: AIDepthFeatures): string[] {
  const evidence: string[] = [];
  if (f.ai_config_repo_count > 0)
    evidence.push(`AI config files in ${String(f.ai_config_repo_count)} repos`);
  if (f.ai_coauthor_commit_count > 0)
    evidence.push(`${String(f.ai_coauthor_commit_count)} AI co-authored commits`);
  if (f.has_ai_builder_project)
    evidence.push(`Maintains AI builder project (${String(f.ai_project_stars)} stars)`);
  if (f.has_ai_community_maintenance) evidence.push('AI community contributor');
  return evidence;
}

function buildReachabilityEvidence(f: ReachabilityFeatures): string[] {
  const evidence: string[] = [];
  if (f.has_email) evidence.push('Email available');
  if (f.has_blog) evidence.push('Blog available');
  if (f.has_twitter) evidence.push('Twitter/X available');
  if (f.has_hireable) evidence.push('Marked as hireable');
  if (f.has_chinese_community_profile) evidence.push('Chinese tech community profile');
  return evidence;
}

function buildFitEvidence(f: FitFeatures, city: string | null): string[] {
  const evidence: string[] = [];
  if (f.city_bonus > 0) evidence.push(`City: ${city ?? 'unknown'} (+${String(f.city_bonus)})`);
  if (f.language_match) evidence.push('Primary language matches preference');
  if (f.is_too_senior) evidence.push('Too senior (may be unreachable)');
  return evidence;
}

function buildSummary(username: string, action: RecommendedAction, score: number): string {
  const actionText = {
    reach_out: 'Recommended for outreach',
    monitor: 'Worth monitoring',
    skip: 'Not recommended at this time',
  };
  return `${username}: ${actionText[action]} (score: ${round2(score).toFixed(1)})`;
}

function emptyEvaluation(): Evaluation {
  return {
    skill_score: 0,
    skill_evidence: [],
    ai_depth_score: 0,
    ai_depth_tier: 'consumer',
    ai_depth_evidence: [],
    reachability_score: 0,
    reachability_evidence: [],
    fit_score: 0,
    fit_evidence: [],
    final_score: 0,
    recommended_action: 'skip',
    summary: 'No profile data available',
    evaluated_at: new Date().toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
