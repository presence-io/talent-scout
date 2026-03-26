import type { APIRoute } from 'astro';
import { loadShortlist } from '@talent-scout/ai-evaluator';
import { resolveOutputDir } from '../../lib/file.js';
import {
  computeActionDistribution,
  computeTierDistribution,
  computeCityDistribution,
  computeConfidenceBuckets,
} from '../../lib/stats.js';

export const GET: APIRoute = async () => {
  const base = process.cwd();
  const outputDir = resolveOutputDir(base);
  const entries = await loadShortlist(outputDir).catch(() => []);

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
