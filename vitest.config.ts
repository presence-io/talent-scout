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
        'packages/dashboard/src/pages/**',
        'packages/dashboard/src/components/**',
        '**/index.ts',
        '**/__fixtures__/**',
      ],
    },
  },
});
