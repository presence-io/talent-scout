import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { isIgnored, readIgnoreList } from '../src/ignore-list.js';

function makeTmpDir() {
  return join(tmpdir(), `talent-scout-ignore-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('readIgnoreList', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
  });

  it('should return empty object when file does not exist', async () => {
    const result = await readIgnoreList(join(tmpDir, 'nonexistent.json'));
    expect(result).toEqual({});
  });

  it('should read a valid ignore list', async () => {
    const filePath = join(tmpDir, 'ignore-list.json');
    await writeFile(
      filePath,
      JSON.stringify({
        baduser: { reason: 'spam', ignored_at: '2026-01-01T00:00:00Z' },
      })
    );

    const result = await readIgnoreList(filePath);
    expect(result['baduser']).toBeDefined();
    expect(result['baduser']).toMatchObject({ reason: 'spam' });
  });
});

describe('isIgnored', () => {
  const ignoreList = {
    spammer: { reason: 'spam account', ignored_at: '2026-01-01T00:00:00Z' },
    inactive: {
      reason: 'no longer active',
      ignored_at: '2026-02-01T00:00:00Z',
    },
  };

  it('should return true for ignored usernames', () => {
    expect(isIgnored(ignoreList, 'spammer')).toBe(true);
  });

  it('should return false for non-ignored usernames', () => {
    expect(isIgnored(ignoreList, 'gooduser')).toBe(false);
  });

  it('should match case-insensitively (lowercased lookup)', () => {
    expect(isIgnored(ignoreList, 'Spammer')).toBe(true);
    expect(isIgnored(ignoreList, 'SPAMMER')).toBe(true);
    expect(isIgnored(ignoreList, 'spammer')).toBe(true);
  });
});
