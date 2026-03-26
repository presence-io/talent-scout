export { mergeCandidateRecords, mergeSignalMaps, deduplicateSignals } from './merge.js';
export {
  identifyCandidate,
  computeChinaConfidence,
  containsSimplifiedChinese,
} from './identity.js';
export {
  evaluateCandidate,
  extractSkillFeatures,
  computeSkillScore,
  extractAIDepthFeatures,
  computeAIDepthScore,
  extractReachabilityFeatures,
  computeReachabilityScore,
  extractFitFeatures,
  computeFitScore,
  computeFinalScore,
  determineAction,
} from './scoring.js';
export { runProcessPipeline } from './pipeline.js';
export { loadProcessedCandidates, loadIdentityResults } from './query.js';
