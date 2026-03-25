import { type Candidate, type Signal } from '@talent-scout/shared';

/** Merge signal maps from multiple collection sources, dedup by username and signal quad */
export function mergeSignalMaps(...maps: Map<string, Signal[]>[]): Map<string, Candidate> {
  const merged = new Map<string, Candidate>();

  for (const map of maps) {
    for (const [username, signals] of map) {
      const key = username.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.signals.push(...signals);
      } else {
        merged.set(key, {
          username: key,
          signals: [...signals],
          signal_score: 0,
          is_ai_coding_enthusiast: false,
        });
      }
    }
  }

  // Dedup signals and compute derived fields
  for (const candidate of merged.values()) {
    candidate.signals = deduplicateSignals(candidate.signals);
    candidate.signal_score = candidate.signals.reduce((sum, s) => sum + s.weight, 0);
    candidate.is_ai_coding_enthusiast = candidate.signals.some(
      (s) =>
        s.type.startsWith('code:') || s.type.startsWith('commit:') || s.type.startsWith('topic:'),
    );
  }

  return merged;
}

/**
 * Dedup signals by (type, repo, object_id) triple.
 * Same author in same repo with same signal type keeps only highest weight.
 */
export function deduplicateSignals(signals: Signal[]): Signal[] {
  const seen = new Map<string, Signal>();
  for (const s of signals) {
    const key = `${s.type}|${s.repo ?? ''}|${s.object_id ?? ''}`;
    const existing = seen.get(key);
    if (!existing || s.weight > existing.weight) {
      seen.set(key, s);
    }
  }
  return Array.from(seen.values());
}

/** Merge candidates from JSON objects (e.g., loaded from files) */
export function mergeCandidateRecords(
  ...records: Record<string, Signal[]>[]
): Map<string, Candidate> {
  const maps = records.map((r) => {
    const m = new Map<string, Signal[]>();
    for (const [k, v] of Object.entries(r)) {
      m.set(k, v);
    }
    return m;
  });
  return mergeSignalMaps(...maps);
}
