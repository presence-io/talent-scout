import { describe, it, expect } from 'vitest';

import type { Signal } from '@talent-scout/shared';
import { mergeSignalMaps, deduplicateSignals, mergeCandidateRecords } from '../src/merge.js';

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    type: 'code:claude-md',
    detail: 'test',
    weight: 1.0,
    source: 'test',
    ...overrides,
  };
}

describe('deduplicateSignals', () => {
  it('should keep unique signals', () => {
    const signals = [
      signal({ type: 'code:claude-md', repo: 'a/b', object_id: '1' }),
      signal({ type: 'code:cursor-rules', repo: 'a/b', object_id: '2' }),
    ];
    const result = deduplicateSignals(signals);
    expect(result).toHaveLength(2);
  });

  it('should dedup identical (type, repo, object_id) keeping highest weight', () => {
    const signals = [
      signal({ type: 'code:claude-md', repo: 'a/b', object_id: '1', weight: 1 }),
      signal({ type: 'code:claude-md', repo: 'a/b', object_id: '1', weight: 3 }),
      signal({ type: 'code:claude-md', repo: 'a/b', object_id: '1', weight: 2 }),
    ];
    const result = deduplicateSignals(signals);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ weight: 3 }));
  });

  it('should treat missing repo/object_id as empty string for dedup', () => {
    const signals = [signal({ type: 'star:repo' }), signal({ type: 'star:repo' })];
    const result = deduplicateSignals(signals);
    expect(result).toHaveLength(1);
  });
});

describe('mergeSignalMaps', () => {
  it('should merge multiple maps into candidates', () => {
    const map1 = new Map<string, Signal[]>([
      ['alice', [signal({ detail: 'from map1', type: 'code:claude-md', object_id: '1' })]],
    ]);
    const map2 = new Map<string, Signal[]>([
      ['alice', [signal({ detail: 'from map2', type: 'code:cursor-rules', object_id: '2' })]],
      ['bob', [signal({ detail: 'bob signal' })]],
    ]);

    const result = mergeSignalMaps(map1, map2);
    expect(result.size).toBe(2);
    const alice = result.get('alice');
    expect(alice).toBeDefined();
    expect(alice?.signals).toHaveLength(2);
    const bob = result.get('bob');
    expect(bob).toBeDefined();
    expect(bob?.signals).toHaveLength(1);
  });

  it('should lowercase usernames for dedup', () => {
    const map1 = new Map<string, Signal[]>([['Alice', [signal()]]]);
    const map2 = new Map<string, Signal[]>([['ALICE', [signal()]]]);

    const result = mergeSignalMaps(map1, map2);
    expect(result.size).toBe(1);
    expect(result.has('alice')).toBe(true);
  });

  it('should compute signal_score as sum of weights', () => {
    const map = new Map<string, Signal[]>([
      [
        'user',
        [
          signal({ weight: 2, type: 'code:claude-md', object_id: '1' }),
          signal({ weight: 3, type: 'code:cursor-rules', object_id: '2' }),
        ],
      ],
    ]);
    const result = mergeSignalMaps(map);
    expect(result.get('user')?.signal_score).toBe(5);
  });

  it('should set is_ai_coding_enthusiast based on signal types', () => {
    const mapWithAI = new Map<string, Signal[]>([
      ['user1', [signal({ type: 'code:claude-md', object_id: '1' })]],
    ]);
    const mapWithoutAI = new Map<string, Signal[]>([
      ['user2', [signal({ type: 'star:repo', object_id: '2' })]],
    ]);

    const result = mergeSignalMaps(mapWithAI, mapWithoutAI);
    expect(result.get('user1')?.is_ai_coding_enthusiast).toBe(true);
    expect(result.get('user2')?.is_ai_coding_enthusiast).toBe(false);
  });
});

describe('mergeCandidateRecords', () => {
  it('should convert records to maps and merge', () => {
    const record1: Record<string, Signal[]> = {
      alice: [signal({ detail: 'r1' })],
    };
    const record2: Record<string, Signal[]> = {
      bob: [signal({ detail: 'r2' })],
    };

    const result = mergeCandidateRecords(record1, record2);
    expect(result.size).toBe(2);
    expect(result.has('alice')).toBe(true);
    expect(result.has('bob')).toBe(true);
  });
});
