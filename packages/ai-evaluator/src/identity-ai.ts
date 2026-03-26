import type { Candidate, TalentConfig } from '@talent-scout/shared';
import { callAgent } from '@talent-scout/shared';

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
 */
export async function inferIdentityBatch(
  candidates: Candidate[],
  config: TalentConfig
): Promise<number> {
  const grayArea = candidates.filter((c) => {
    const conf = c.identity?.china_confidence ?? 0;
    return conf > 0.3 && conf < 0.7;
  });

  if (grayArea.length === 0) return 0;

  const batchSize = config.openclaw.batch_size;
  let processed = 0;

  for (let i = 0; i < grayArea.length; i += batchSize) {
    const batch = grayArea.slice(i, i + batchSize);

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
  }

  return processed;
}
