import { beforeEach, describe, expect, it, vi } from 'vitest';

const execaMock = vi.fn();

vi.mock('execa', () => ({
  execa: execaMock,
}));

describe('sendMessage', () => {
  beforeEach(() => {
    execaMock.mockReset();
  });

  it('builds an OpenClaw message send invocation with attachment options', async () => {
    execaMock.mockResolvedValue({ stdout: '{"ok":true}' });

    const { sendMessage } = await import('../src/openclaw.js');
    const result = await sendMessage({
      channel: 'telegram',
      target: '@talent-scout',
      message: 'Attached workspace snapshot',
      media: '/tmp/workspace-data.zip',
      account: 'bot-account',
      threadId: '99',
      dryRun: true,
      forceDocument: true,
    });

    expect(execaMock).toHaveBeenCalledWith('openclaw', [
      'message',
      'send',
      '--channel',
      'telegram',
      '--target',
      '@talent-scout',
      '--json',
      '--account',
      'bot-account',
      '--message',
      'Attached workspace snapshot',
      '--media',
      '/tmp/workspace-data.zip',
      '--thread-id',
      '99',
      '--dry-run',
      '--force-document',
    ]);
    expect(result).toEqual({ ok: true });
  });

  it('rejects empty payloads', async () => {
    const { sendMessage } = await import('../src/openclaw.js');

    await expect(sendMessage({ channel: 'telegram', target: '@talent-scout' })).rejects.toThrow(
      'OpenClaw messages require either message text or a media attachment.'
    );
  });
});
