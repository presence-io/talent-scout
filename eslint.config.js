import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  tseslint.configs.strictTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/__tests__/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    extends: [tseslint.configs.disableTypeChecked],
  },
  { ignores: ['**/dist/**', 'output/**', 'cache/**', 'legacy/**', '**/astro.config.*'] },
);
