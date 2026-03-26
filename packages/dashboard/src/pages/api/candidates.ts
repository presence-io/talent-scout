import type { APIRoute } from 'astro';
import type { RecommendedAction } from '@talent-scout/shared';
import { loadShortlist } from '@talent-scout/ai-evaluator';
import { readJsonFile, resolveOutputDir, resolveUserDataDir } from '../../lib/file.js';
import {
  sortCandidates,
  filterByAction,
  filterByCity,
  filterByAIDepthTier,
  paginateCandidates,
} from '../../lib/candidates.js';
import type { SortField, SortOrder } from '../../lib/candidates.js';
import { mergeWithAnnotations, mergeWithIgnoreList } from '../../lib/merge.js';
import type { AnnotationMap } from '../../lib/merge.js';
import type { IgnoreList } from '@talent-scout/shared';
import { join } from 'node:path';

export const GET: APIRoute = async ({ url }) => {
  const base = process.cwd();
  const outputDir = resolveOutputDir(base);
  const userDataDir = resolveUserDataDir(base);

  const entries = await loadShortlist(outputDir).catch(() => []);
  const annotations = await readJsonFile<AnnotationMap>(join(userDataDir, 'annotations.json'), {});
  const ignoreList = await readJsonFile<IgnoreList>(join(userDataDir, 'ignore-list.json'), {});

  let merged = mergeWithAnnotations(entries, annotations);
  merged = mergeWithIgnoreList(merged, ignoreList);

  let list = merged.filter((e: { ignored?: boolean }) => !e.ignored);

  const action = url.searchParams.get('action');
  if (action) list = filterByAction(list, action as RecommendedAction);

  const city = url.searchParams.get('city');
  if (city) list = filterByCity(list, city);

  const tier = url.searchParams.get('tier');
  if (tier) list = filterByAIDepthTier(list, tier);

  const sortBy = (url.searchParams.get('sort') ?? 'final_score') as SortField;
  const order = (url.searchParams.get('order') ?? 'desc') as SortOrder;
  list = sortCandidates(list, sortBy, order);

  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
  const result = paginateCandidates(list, page, limit);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
