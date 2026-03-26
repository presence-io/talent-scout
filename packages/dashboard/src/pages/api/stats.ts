import { loadShortlist, loadStatsHistory } from '@talent-scout/ai-evaluator';
import type { APIRoute } from 'astro';
import { dirname } from 'node:path';

import { resolveOutputDir } from '@/lib/file.js';
import {
  computeActionDistribution,
  computeCityDistribution,
  computeConfidenceBuckets,
  computeHistoryTrends,
  computeTierDistribution,
  resolveHeadlineTotal,
} from '@/lib/stats.js';

export const GET: APIRoute = async () => {
  const base = process.cwd();
  const outputDir = resolveOutputDir(base);
  const entries = await loadShortlist(outputDir).catch(() => []);
  const history = await loadStatsHistory(dirname(outputDir));

  const result = {
    total: resolveHeadlineTotal(entries, history),
    actionDistribution: computeActionDistribution(entries),
    tierDistribution: computeTierDistribution(entries),
    cityDistribution: computeCityDistribution(entries),
    confidenceBuckets: computeConfidenceBuckets(entries),
    trends: computeHistoryTrends(history),
  };

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
