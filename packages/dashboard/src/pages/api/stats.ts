import type { APIRoute } from 'astro';
import { join } from 'node:path';
import type { TalentEntry } from '@talent-scout/shared';
import { readJsonFile, resolveOutputDir } from '../../lib/file.js';
import {
  computeActionDistribution,
  computeTierDistribution,
  computeCityDistribution,
  computeConfidenceBuckets,
} from '../../lib/stats.js';

export const GET: APIRoute = async () => {
  const base = process.cwd();
  const outputDir = resolveOutputDir(base);
  const entries = await readJsonFile<TalentEntry[]>(join(outputDir, 'shortlist.json'), []);

  const result = {
    total: entries.length,
    actionDistribution: computeActionDistribution(entries),
    tierDistribution: computeTierDistribution(entries),
    cityDistribution: computeCityDistribution(entries),
    confidenceBuckets: computeConfidenceBuckets(entries),
  };

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
