import type { Candidate, TalentConfig } from '@talent-scout/shared';
import { callAgent } from '@talent-scout/shared';

interface AIEvalResult {
  username: string;
  summary?: string;
}

/**
 * Run AI-assisted deep evaluation on top candidates via the OpenClaw
 * evaluator agent. Enriches the rule-based evaluation with an AI-generated
 * human-readable summary.
 *
 * Candidates must already have rule-based evaluation attached.
 * Only processes up to `config.evaluation.max_ai_evaluations` candidates.
 */
export async function deepEvaluateBatch(
  candidates: Candidate[],
  config: TalentConfig,
): Promise<number> {
  const eligible = candidates
    .filter((c) => c.evaluation)
    .sort((a, b) => (b.evaluation?.final_score ?? 0) - (a.evaluation?.final_score ?? 0))
    .slice(0, config.evaluation.max_ai_evaluations);

  if (eligible.length === 0) return 0;

  const batchSize = config.openclaw.batch_size;
  let processed = 0;

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);

    const result = await callAgent('evaluator', {
      task: 'batch_deep_evaluation',
      candidates: batch.map((c) => ({
        username: c.username,
        profile: c.profile,
        signals: c.signals,
        evaluation: c.evaluation,
        features: c.features,
      })),
    });

    const results = (result['results'] ?? []) as AIEvalResult[];
    for (const r of results) {
      const c = batch.find((b) => b.username === r.username);
      if (c?.evaluation && r.summary) {
        c.evaluation.summary = r.summary;
        processed++;
      }
    }
  }

  return processed;
}
