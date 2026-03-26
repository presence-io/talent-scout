import type { Candidate, TalentEntry } from '@talent-scout/shared';
import type { RunStats } from '@talent-scout/ai-evaluator';

/** Render shortlist as plain text suitable for IM/TUI. */
export function renderShortlistText(entries: TalentEntry[]): string {
  if (entries.length === 0) return 'No candidates in shortlist.';

  const lines = [`Shortlist (${String(entries.length)} candidates)`, '─'.repeat(72)];

  for (const e of entries) {
    const city = e.city ?? '?';
    const action = e.recommended_action.toUpperCase();
    lines.push(
      `  ${e.username.padEnd(24)} ${e.final_score.toFixed(1).padStart(5)}  ` +
        `skill=${e.skill_score.toFixed(1)} ai=${e.ai_depth_score.toFixed(1)} ` +
        `[${action}] ${city}`,
    );
  }

  return lines.join('\n');
}

/** Render candidate details as plain text suitable for IM/TUI. */
export function renderCandidateText(candidate: Candidate): string {
  const p = candidate.profile;
  const ev = candidate.evaluation;
  const id = candidate.identity;

  const lines = [`Candidate: ${candidate.username}`, '─'.repeat(48)];

  if (p) {
    if (p.name) lines.push(`Name: ${p.name}`);
    if (p.location) lines.push(`Location: ${p.location}`);
    if (p.company) lines.push(`Company: ${p.company}`);
    if (p.email) lines.push(`Email: ${p.email}`);
    if (p.blog) lines.push(`Blog: ${p.blog}`);
    lines.push(`Followers: ${String(p.followers)}  Repos: ${String(p.public_repos)}`);
  }

  if (id) {
    lines.push('');
    lines.push(`China Confidence: ${id.china_confidence.toFixed(2)}`);
    if (id.city) lines.push(`City: ${id.city}`);
    for (const s of id.signals) {
      lines.push(`  [T${String(s.tier)}] ${s.type}: ${s.evidence}`);
    }
  }

  if (ev) {
    lines.push('');
    lines.push(
      `Skill: ${ev.skill_score.toFixed(1)}  AI Depth: ${ev.ai_depth_score.toFixed(1)} (${ev.ai_depth_tier})`,
    );
    lines.push(
      `Reachability: ${ev.reachability_score.toFixed(1)}  Fit: ${ev.fit_score.toFixed(1)}`,
    );
    lines.push(`Final Score: ${ev.final_score.toFixed(1)}  Action: ${ev.recommended_action}`);
    if (ev.summary) lines.push(`Summary: ${ev.summary}`);
  }

  lines.push('');
  lines.push(`Signals (${String(candidate.signals.length)}):`);
  for (const s of candidate.signals.slice(0, 10)) {
    lines.push(`  [${s.type}] ${s.detail} (w=${String(s.weight)})`);
  }
  if (candidate.signals.length > 10) {
    lines.push(`  ... and ${String(candidate.signals.length - 10)} more`);
  }

  return lines.join('\n');
}

/** Render run stats as plain text suitable for IM/TUI. */
export function renderStatsText(stats: RunStats): string {
  const lines = [
    'Run Statistics',
    '─'.repeat(40),
    `Total candidates: ${String(stats.total_candidates)}`,
    `Identified Chinese: ${String(stats.identified_chinese)}`,
    `Evaluated: ${String(stats.evaluated)}`,
    `Reach out: ${String(stats.reach_out)}`,
    `Monitor: ${String(stats.monitor)}`,
    `Skip: ${String(stats.skip)}`,
    `Avg skill score: ${String(stats.avg_skill_score)}`,
    `Avg AI depth: ${String(stats.avg_ai_depth_score)}`,
    `Run at: ${stats.run_at}`,
  ];

  return lines.join('\n');
}
