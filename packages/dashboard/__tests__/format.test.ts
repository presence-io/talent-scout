import { describe, expect, it } from 'vitest';

import {
  actionBadgeClass,
  formatAction,
  formatDate,
  formatScore,
  formatTier,
} from '../src/lib/format.js';

describe('formatScore', () => {
  it('formats to one decimal place', () => {
    expect(formatScore(3.456)).toBe('3.5');
    expect(formatScore(10)).toBe('10.0');
  });
});

describe('formatDate', () => {
  it('formats ISO date to YYYY-MM-DD', () => {
    expect(formatDate('2025-03-25T10:00:00Z')).toBe('2025-03-25');
  });
});

describe('formatAction', () => {
  it('maps known actions', () => {
    expect(formatAction('reach_out')).toBe('Reach Out');
    expect(formatAction('monitor')).toBe('Monitor');
    expect(formatAction('skip')).toBe('Skip');
  });

  it('returns raw value for unknown action', () => {
    expect(formatAction('other')).toBe('other');
  });
});

describe('formatTier', () => {
  it('maps known tiers', () => {
    expect(formatTier('builder')).toBe('Builder');
    expect(formatTier('amplifier')).toBe('Amplifier');
  });

  it('returns raw value for unknown tier', () => {
    expect(formatTier('unknown')).toBe('unknown');
  });
});

describe('actionBadgeClass', () => {
  it('returns correct CSS classes', () => {
    expect(actionBadgeClass('reach_out')).toBe('badge-success');
    expect(actionBadgeClass('monitor')).toBe('badge-warning');
    expect(actionBadgeClass('skip')).toBe('badge-error');
    expect(actionBadgeClass('other')).toBe('badge-ghost');
  });
});
