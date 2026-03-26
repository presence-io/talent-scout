import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  resolveCacheDir,
  resolveOutputDir,
  resolvePatchDir,
  resolveUserDataDir,
  resolveWorkspaceDir,
} from '../src/workspace.js';

describe('workspace path resolution', () => {
  afterEach(() => {
    delete process.env['TALENT_WORKSPACE'];
    delete process.env['INIT_CWD'];
  });

  describe('resolveWorkspaceDir', () => {
    it('uses TALENT_WORKSPACE env var when set', () => {
      process.env['TALENT_WORKSPACE'] = '/custom/workspace';
      expect(resolveWorkspaceDir()).toBe(resolve('/custom/workspace'));
    });

    it('uses base + workspace-data when no env var', () => {
      expect(resolveWorkspaceDir('/my/project')).toBe(resolve('/my/project', 'workspace-data'));
    });

    it('accepts a base path that already points at workspace-data', () => {
      expect(resolveWorkspaceDir('/my/project/workspace-data')).toBe(
        resolve('/my/project/workspace-data')
      );
    });

    it('uses INIT_CWD when no base and no TALENT_WORKSPACE', () => {
      delete process.env['TALENT_WORKSPACE'];
      process.env['INIT_CWD'] = '/monorepo/root';
      expect(resolveWorkspaceDir()).toBe(resolve('/monorepo/root', 'workspace-data'));
    });

    it('falls back to cwd when no base, no INIT_CWD, no TALENT_WORKSPACE', () => {
      delete process.env['TALENT_WORKSPACE'];
      delete process.env['INIT_CWD'];
      expect(resolveWorkspaceDir()).toBe(resolve(process.cwd(), 'workspace-data'));
    });
  });

  describe('resolveOutputDir', () => {
    it('appends output to workspace dir', () => {
      expect(resolveOutputDir('/my/project')).toBe(
        resolve('/my/project', 'workspace-data', 'output')
      );
    });

    it('respects TALENT_WORKSPACE', () => {
      process.env['TALENT_WORKSPACE'] = '/custom';
      expect(resolveOutputDir()).toBe(resolve('/custom', 'output'));
    });
  });

  describe('resolveUserDataDir', () => {
    it('appends user-data to workspace dir', () => {
      expect(resolveUserDataDir('/base')).toBe(resolve('/base', 'workspace-data', 'user-data'));
    });
  });

  describe('resolveCacheDir', () => {
    it('appends cache to workspace dir', () => {
      expect(resolveCacheDir('/base')).toBe(resolve('/base', 'workspace-data', 'cache'));
    });
  });

  describe('resolvePatchDir', () => {
    it('appends skill-patches to workspace dir', () => {
      expect(resolvePatchDir('/base')).toBe(resolve('/base', 'workspace-data', 'skill-patches'));
    });
  });
});
