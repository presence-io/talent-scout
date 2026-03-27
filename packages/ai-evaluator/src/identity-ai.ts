import type { Candidate, TalentConfig } from '@talent-scout/shared';
import { Checkpoint, callAgent } from '@talent-scout/shared';

interface AIIdentityInference {
  username: string;
  is_chinese: boolean;
  confidence: number;
  evidence: string;
  city?: string;
}

/**
 * Run AI-assisted identity inference on gray-area candidates
 * (0.3 < china_confidence < 0.7) via the OpenClaw identity agent.
 *
 * Mutates candidates in place — updates identity.china_confidence,
 * identity.city, and identity.ai_assisted when AI provides stronger signals.
 *
 * If a checkpoint is provided, already-processed usernames are skipped
 * and progress is persisted after each batch.
 */
export async function inferIdentityBatch(
  candidates: Candidate[],
  config: TalentConfig,
  checkpoint?: Checkpoint
): Promise<number> {
  const done = new Set((checkpoint?.get('ai_identity_done') as string[] | undefined) ?? []);

  const grayArea = candidates.filter((c) => {
    if (done.has(c.username)) return false;
    const conf = c.identity?.china_confidence ?? 0;
    return conf > 0.3 && conf < 0.7;
  });

  if (grayArea.length === 0) {
    console.log('      No gray-area candidates to process');
    return 0;
  }
  console.log(`      ${String(grayArea.length)} gray-area candidates to infer`);
  if (done.size > 0) {
    console.log(`      Resuming: skipping ${String(done.size)} already processed`);
  }

  const batchSize = config.openclaw.batch_size;
  let processed = 0;
  const totalBatches = Math.ceil(grayArea.length / batchSize);

  for (let i = 0; i < grayArea.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const batch = grayArea.slice(i, i + batchSize);
    console.log(`      Batch ${String(batchNum)}/${String(totalBatches)}: ${batch.map((c) => c.username).join(', ')}`);

    const result = await callAgent('identity', {
      task: 'batch_identity_inference',
      candidates: batch.map((c) => ({
        username: c.username,
        profile: c.profile,
        signals: c.identity?.signals ?? [],
      })),
    });

    const inferences = (result['results'] ?? []) as AIIdentityInference[];
    for (const inf of inferences) {
      const c = batch.find((b) => b.username === inf.username);
      if (!c?.identity) continue;

      if (inf.is_chinese && inf.confidence > c.identity.china_confidence) {
        c.identity.china_confidence = inf.confidence;
      }
      if (inf.city && !c.identity.city) {
        c.identity.city = inf.city;
      }
      c.identity.ai_assisted = true;
      processed++;
    }

    console.log(`      Batch ${String(batchNum)} done: ${String(inferences.length)} inferences returned`);

    // Persist progress after each batch
    for (const c of batch) done.add(c.username);
    if (checkpoint) await checkpoint.mark('ai_identity_done', [...done]);
  }

  console.log(`      ✓ AI identity inference complete: ${String(processed)} updated`);
  return processed;
}
