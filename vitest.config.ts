import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        'scripts/**',
        'eslint.config.*',
        'vitest.config.*',

        // Dashboard: Astro pages/components/layouts/config are SSR boundary
        'packages/dashboard/src/pages/**',
        'packages/dashboard/src/components/**',
        'packages/dashboard/src/layouts/**',
        'packages/dashboard/astro.config.*',
        'packages/dashboard/.astro/**',

        // Re-export barrels & type-only files
        '**/index.ts',
        '**/__fixtures__/**',
        'packages/shared/src/types.ts',

        // CLI entry points (tested via E2E, not unit)
        'packages/data-processor/src/cli.ts',
        'packages/skills/src/commands.ts',
        'packages/skills/src/query.ts',

        // External-service I/O boundaries
        'packages/shared/src/github.ts',
        'packages/shared/src/openclaw.ts',
        'packages/shared/src/cron-sync.ts',
        'packages/ai-evaluator/src/deep-eval.ts',
        'packages/ai-evaluator/src/identity-ai.ts',
        'packages/data-collector/src/community.ts',
        'packages/data-collector/src/follower-graph.ts',
        'packages/data-collector/src/stargazers.ts',
        'packages/data-collector/src/github-signals.ts',
        'packages/data-processor/src/validate-identity.ts',
      ],
    },
  },
});
