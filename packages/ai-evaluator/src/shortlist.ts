import type { Candidate, TalentEntry } from '@talent-scout/shared';

/** Convert a fully-evaluated Candidate to a TalentEntry for the shortlist. */
export function candidateToTalentEntry(c: Candidate): TalentEntry {
  const ev = c.evaluation;
  const p = c.profile;

  return {
    username: c.username,
    name: p?.name ?? null,
    city: c.identity?.city ?? null,
    company: p?.company ?? null,
    email: p?.email ?? null,
    blog: p?.blog ?? null,
    twitter: p?.twitter ?? null,
    profile_url: `https://github.com/${c.username}`,
    china_confidence: c.identity?.china_confidence ?? 0,
    skill_score: ev?.skill_score ?? 0,
    ai_depth_score: ev?.ai_depth_score ?? 0,
    ai_depth_tier: ev?.ai_depth_tier ?? 'consumer',
    reachability_score: ev?.reachability_score ?? 0,
    fit_score: ev?.fit_score ?? 0,
    final_score: ev?.final_score ?? 0,
    recommended_action: ev?.recommended_action ?? 'skip',
    summary: ev?.summary ?? '',
    signal_types: [...new Set(c.signals.map((s) => s.type))],
    signal_count: c.signals.length,
  };
}

/**
 * Produce a ranked shortlist from evaluated candidates.
 * Only candidates with a non-skip action are included.
 */
export function produceShortlist(candidates: Candidate[]): TalentEntry[] {
  return candidates
    .filter((c) => c.evaluation && c.evaluation.recommended_action !== 'skip')
    .sort((a, b) => (b.evaluation?.final_score ?? 0) - (a.evaluation?.final_score ?? 0))
    .map(candidateToTalentEntry);
}
