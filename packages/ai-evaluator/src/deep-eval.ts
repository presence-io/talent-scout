import type { AIProvider, Candidate, TalentConfig } from '@talent-scout/shared';
import { Checkpoint } from '@talent-scout/shared';

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
 *
 * If a checkpoint is provided, already-processed usernames are skipped
 * and progress is persisted after each batch.
 */
export async function deepEvaluateBatch(
  candidates: Candidate[],
  config: TalentConfig,
  provider: AIProvider,
  checkpoint?: Checkpoint
): Promise<number> {
  const done = new Set((checkpoint?.get('deep_eval_done') as string[] | undefined) ?? []);

  const eligible = candidates
    .filter((c) => c.evaluation && !done.has(c.username))
    .sort((a, b) => (b.evaluation?.final_score ?? 0) - (a.evaluation?.final_score ?? 0))
    .slice(0, config.evaluation.max_ai_evaluations);

  if (eligible.length === 0) return 0;
  if (done.size > 0) {
    console.log(`  Resuming deep eval: skipping ${String(done.size)} already processed`);
  }

  const batchSize = config.ai?.batch_size ?? config.openclaw.batch_size;
  let processed = 0;

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);

    const result = await provider.callAgent('evaluator', {
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

    // Persist progress after each batch
    for (const c of batch) done.add(c.username);
    if (checkpoint) await checkpoint.mark('deep_eval_done', [...done]);
  }

  return processed;
}
