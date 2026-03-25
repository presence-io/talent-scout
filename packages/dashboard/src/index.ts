export {
  sortCandidates,
  filterByAction,
  filterByCity,
  filterByAIDepthTier,
  paginateCandidates,
} from './lib/candidates.js';
export type { SortField, SortOrder, PaginationResult } from './lib/candidates.js';

export {
  formatScore,
  formatDate,
  formatAction,
  formatTier,
  actionBadgeClass,
} from './lib/format.js';

export { mergeWithAnnotations, mergeWithIgnoreList } from './lib/merge.js';
export type { Annotation, AnnotationMap, MergedTalentEntry } from './lib/merge.js';

export { readJsonFile, writeJsonAtomic, resolveOutputDir, resolveUserDataDir } from './lib/file.js';

export {
  computeActionDistribution,
  computeTierDistribution,
  computeCityDistribution,
  computeConfidenceBuckets,
} from './lib/stats.js';
export type { DistributionEntry } from './lib/stats.js';
