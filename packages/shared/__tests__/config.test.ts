import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { loadConfig, resetConfigCache, TalentConfigSchema } from '../src/config.js';

function makeTmpDir() {
  return join(tmpdir(), `talent-scout-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe('TalentConfigSchema', () => {
  it('should parse a minimal config with defaults', () => {
    const result = TalentConfigSchema.parse({});
    expect(result.api_budget.max_total_calls).toBe(2000);
    expect(result.api_budget.search_sleep_ms).toBe(2500);
    expect(result.evaluation.weights.skill).toBe(0.35);
    expect(result.evaluation.activity_penalty).toBe(-3.0);
    expect(result.cache.ttl.user_profile).toBe(604800);
    expect(result.openclaw.batch_size).toBe(10);
    expect(result.identity.ai_assist_range).toEqual([0.3, 0.7]);
  });

  it('should parse code_signals', () => {
    const result = TalentConfigSchema.parse({
      code_signals: [{ filename: 'CLAUDE.md', path: '/', weight: 2.0, label: 'ai-config:claude' }],
    });
    expect(result.code_signals).toHaveLength(1);
    expect(result.code_signals[0]).toMatchObject({ filename: 'CLAUDE.md' });
  });

  it('should reject invalid code_signals (missing weight)', () => {
    expect(() =>
      TalentConfigSchema.parse({
        code_signals: [{ filename: 'CLAUDE.md', path: '/' }],
      }),
    ).toThrow();
  });

  it('should parse evaluation weights with overrides', () => {
    const result = TalentConfigSchema.parse({
      evaluation: { weights: { skill: 0.5 } },
    });
    expect(result.evaluation.weights.skill).toBe(0.5);
    expect(result.evaluation.weights.ai_depth).toBe(0.3);
  });

  it('should parse openclaw agents', () => {
    const result = TalentConfigSchema.parse({
      openclaw: {
        agents: {
          identity: { name: 'talent-identity', workspace: './pkg', timeout: 60 },
        },
      },
    });
    expect(result.openclaw.agents['identity']).toMatchObject({ name: 'talent-identity' });
  });

  it('should parse cron config', () => {
    const result = TalentConfigSchema.parse({
      openclaw: {
        cron: [
          {
            name: 'talent-collect',
            schedule: '0 1 * * *',
            command: 'pnpm collect',
          },
        ],
      },
    });
    expect(result.openclaw.cron).toHaveLength(1);
    expect(result.openclaw.cron[0]).toMatchObject({ name: 'talent-collect' });
  });

  it('should parse target_profile with preferred_cities', () => {
    const result = TalentConfigSchema.parse({
      target_profile: {
        preferred_cities: [{ name: 'beijing', bonus: 3.0 }],
        preferred_languages: ['TypeScript', 'Go'],
      },
    });
    expect(result.target_profile.preferred_cities).toHaveLength(1);
    expect(result.target_profile.preferred_languages).toEqual(['TypeScript', 'Go']);
  });
});

describe('loadConfig', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    tmpDir = makeTmpDir();
    await mkdir(tmpDir, { recursive: true });
    resetConfigCache();
    originalEnv = process.env['TALENT_CONFIG'];
  });

  afterEach(() => {
    resetConfigCache();
    if (originalEnv === undefined) {
      delete process.env['TALENT_CONFIG'];
    } else {
      process.env['TALENT_CONFIG'] = originalEnv;
    }
  });

  it('should load a valid YAML config', async () => {
    const configPath = join(tmpDir, 'talents.yaml');
    await writeFile(
      configPath,
      `
api_budget:
  max_total_calls: 500
evaluation:
  weights:
    skill: 0.4
`,
    );
    process.env['TALENT_CONFIG'] = configPath;

    const config = await loadConfig();
    expect(config.api_budget.max_total_calls).toBe(500);
    expect(config.evaluation.weights.skill).toBe(0.4);
    // Defaults still applied
    expect(config.evaluation.weights.ai_depth).toBe(0.3);
  });

  it('should throw on missing config file', async () => {
    process.env['TALENT_CONFIG'] = join(tmpDir, 'nonexistent.yaml');
    await expect(loadConfig()).rejects.toThrow();
  });

  it('should cache config across calls', async () => {
    const configPath = join(tmpDir, 'talents.yaml');
    await writeFile(configPath, 'api_budget:\n  max_total_calls: 100\n');
    process.env['TALENT_CONFIG'] = configPath;

    const first = await loadConfig();
    // Modify file, second call should return cached version
    await writeFile(configPath, 'api_budget:\n  max_total_calls: 999\n');
    const second = await loadConfig();
    expect(second.api_budget.max_total_calls).toBe(first.api_budget.max_total_calls);
  });

  it('should reload when forceReload is true', async () => {
    const configPath = join(tmpDir, 'talents.yaml');
    await writeFile(configPath, 'api_budget:\n  max_total_calls: 100\n');
    process.env['TALENT_CONFIG'] = configPath;

    await loadConfig();
    await writeFile(configPath, 'api_budget:\n  max_total_calls: 999\n');
    const reloaded = await loadConfig(true);
    expect(reloaded.api_budget.max_total_calls).toBe(999);
  });
});
