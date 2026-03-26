import type { Candidate } from '@talent-scout/shared';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { identifyCandidate } from './identity.js';

interface GoldenSetEntry {
  username: string;
  is_chinese: boolean;
  profile: Candidate['profile'];
}

interface ValidationResult {
  total: number;
  true_positive: number;
  true_negative: number;
  false_positive: number;
  false_negative: number;
  precision: number;
  recall: number;
  f1: number;
}

async function main(): Promise<void> {
  const goldenSetPath = resolve(process.cwd(), 'seeds', 'identity-golden-set.json');

  let raw: string;
  try {
    raw = await readFile(goldenSetPath, 'utf-8');
  } catch {
    console.error(`Golden set not found at ${goldenSetPath}`);
    console.error('Create seeds/identity-golden-set.json with format:');
    console.error('[{ "username": "...", "is_chinese": true, "profile": {...} }]');
    process.exit(1);
  }

  const entries = JSON.parse(raw) as GoldenSetEntry[];

  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const candidate: Candidate = {
      username: entry.username,
      signals: [],
      signal_score: 0,
      is_ai_coding_enthusiast: false,
      profile: entry.profile,
    };

    const result = identifyCandidate(candidate);
    const predicted = result.china_confidence >= 0.5;

    if (entry.is_chinese && predicted) {
      tp++;
    } else if (!entry.is_chinese && !predicted) {
      tn++;
    } else if (!entry.is_chinese && predicted) {
      fp++;
      errors.push(`FP: ${entry.username} (confidence: ${result.china_confidence.toFixed(2)})`);
    } else {
      fn++;
      errors.push(`FN: ${entry.username} (confidence: ${result.china_confidence.toFixed(2)})`);
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const result: ValidationResult = {
    total: entries.length,
    true_positive: tp,
    true_negative: tn,
    false_positive: fp,
    false_negative: fn,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000,
    f1: Math.round(f1 * 1000) / 1000,
  };

  console.log('=== Identity Validation Results ===');
  console.log(JSON.stringify(result, null, 2));

  if (errors.length > 0) {
    console.log('\n=== Misclassified ===');
    for (const e of errors) {
      console.log(e);
    }
  }

  // Check against targets
  const targets = { precision: 0.95, recall: 0.8 };
  if (result.precision < targets.precision) {
    console.log(
      `\nWARN: Precision ${String(result.precision)} < target ${String(targets.precision)}`
    );
  }
  if (result.recall < targets.recall) {
    console.log(`\nWARN: Recall ${String(result.recall)} < target ${String(targets.recall)}`);
  }
}

main().catch((err: unknown) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
