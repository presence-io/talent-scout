import type { RecommendedAction, TalentEntry } from '@talent-scout/shared';

export type SortField = keyof Pick<
  TalentEntry,
  | 'username'
  | 'final_score'
  | 'skill_score'
  | 'ai_depth_score'
  | 'reachability_score'
  | 'fit_score'
  | 'china_confidence'
  | 'signal_count'
>;

export type SortOrder = 'asc' | 'desc';

export function sortCandidates<T extends TalentEntry>(
  list: T[],
  by: SortField = 'final_score',
  order: SortOrder = 'desc'
): T[] {
  const sorted = [...list].sort((a, b) => {
    const aVal = a[by];
    const bVal = b[by];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal);
    }
    return (aVal as number) - (bVal as number);
  });
  return order === 'desc' ? sorted.reverse() : sorted;
}

export function filterByAction<T extends TalentEntry>(list: T[], action: RecommendedAction): T[] {
  return list.filter((c) => c.recommended_action === action);
}

export function filterByCity<T extends TalentEntry>(list: T[], city: string): T[] {
  const lower = city.toLowerCase();
  return list.filter((c) => c.city?.toLowerCase().includes(lower));
}

export function filterByAIDepthTier<T extends TalentEntry>(list: T[], tier: string): T[] {
  return list.filter((c) => c.ai_depth_tier === tier);
}

export interface PaginationResult<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export function paginateCandidates<T extends TalentEntry>(
  list: T[],
  page: number = 1,
  limit: number = 50
): PaginationResult<T> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeLimit));
  const clampedPage = Math.min(safePage, totalPages);
  const start = (clampedPage - 1) * safeLimit;
  const items = list.slice(start, start + safeLimit);
  return { items, page: clampedPage, totalPages, totalItems };
}
