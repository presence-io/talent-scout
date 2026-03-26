import { describe, expect, it } from 'vitest';

describe('shared module', () => {
  it('should be importable', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });
});
