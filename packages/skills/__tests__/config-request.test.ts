import * as shared from '@talent-scout/shared';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_REQUEST_USAGE, runConfigRequestCommand } from '../src/config-request.js';

vi.mock('@talent-scout/shared', async () => {
  const actual =
    await vi.importActual<typeof import('@talent-scout/shared')>('@talent-scout/shared');
  return {
    ...actual,
    loadConfig: vi.fn(),
    sendMessage: vi.fn(),
  };
});

describe('runConfigRequestCommand', () => {
  let tempDir: string;
  let originalTalentConfig: string | undefined;
  let originalTalentWorkspace: string | undefined;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), 'talent-scout-config-request-'));
    originalTalentConfig = process.env['TALENT_CONFIG'];
    originalTalentWorkspace = process.env['TALENT_WORKSPACE'];
  });

  afterEach(async () => {
    if (originalTalentConfig === undefined) {
      delete process.env['TALENT_CONFIG'];
    } else {
      process.env['TALENT_CONFIG'] = originalTalentConfig;
    }

    if (originalTalentWorkspace === undefined) {
      delete process.env['TALENT_WORKSPACE'];
    } else {
      process.env['TALENT_WORKSPACE'] = originalTalentWorkspace;
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  it('prints usage for --help', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runConfigRequestCommand(['--help']);

    expect(consoleSpy).toHaveBeenCalledWith(CONFIG_REQUEST_USAGE);
    consoleSpy.mockRestore();
  });

  it('seeds workspace-data/talents.yaml and sends a request through OpenClaw', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });
    vi.mocked(shared.loadConfig).mockResolvedValue(
      shared.TalentConfigSchema.parse({
        openclaw: {
          delivery: {
            channel: 'telegram',
            target: '@talent-scout',
          },
        },
      })
    );
    vi.mocked(shared.sendMessage).mockResolvedValue({ ok: true });

    await runConfigRequestCommand([
      '--workspace',
      workspaceDir,
      '--request',
      '把 openclaw.batch_size 改成 20',
      '--dry-run',
    ]);

    const seededConfigPath = join(workspaceDir, 'talents.yaml');
    expect(existsSync(seededConfigPath)).toBe(true);
    expect(shared.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'telegram',
        target: '@talent-scout',
        dryRun: true,
        message: expect.stringContaining(seededConfigPath),
      })
    );
    expect(vi.mocked(shared.sendMessage).mock.calls[0]?.[0].message).toContain(
      '把 openclaw.batch_size 改成 20'
    );
  });

  it('requires a request unless a full custom message is provided', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });

    await expect(runConfigRequestCommand(['--workspace', workspaceDir])).rejects.toThrow(
      'Config requests require --request, unless you provide a full --message.'
    );
  });

  it('supports explicit delivery overrides and a custom message', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });
    vi.mocked(shared.loadConfig).mockResolvedValue(shared.TalentConfigSchema.parse({}));
    vi.mocked(shared.sendMessage).mockResolvedValue({ ok: true });

    await runConfigRequestCommand([
      `--workspace=${workspaceDir}`,
      '--channel=telegram',
      '--target=@override',
      '--account=bot-1',
      '--thread-id=99',
      '--message=请直接修改配置',
    ]);

    expect(shared.sendMessage).toHaveBeenCalledWith({
      channel: 'telegram',
      target: '@override',
      account: 'bot-1',
      threadId: '99',
      message: '请直接修改配置',
      dryRun: false,
    });
  });

  it('requires a delivery target when neither CLI args nor config defaults provide one', async () => {
    const workspaceDir = join(tempDir, 'workspace-data');
    await mkdir(workspaceDir, { recursive: true });
    vi.mocked(shared.loadConfig).mockResolvedValue(shared.TalentConfigSchema.parse({}));

    await expect(
      runConfigRequestCommand([
        '--workspace',
        workspaceDir,
        '--request',
        '把 target_profile.preferred_languages 加上 Zig',
      ])
    ).rejects.toThrow(
      'Config requests require --channel and --target, or talents.yaml openclaw.delivery defaults.'
    );
  });
});
