// @ts-check
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');
const globals = require('globals');

module.exports = [
  ...expoConfig,
  {
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/__tests__/**/*.ts',
      '**/__tests__/**/*.tsx',
      'jest.setup.js',
      'jest.config.js',
      '__mocks__/**/*.js',
    ],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-undef': 'off',
    },
  },
  {
    files: ['scripts/**/*.{js,ts}', '*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettierConfig,
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      'coverage/',
      'web-build/',
      'expo-env.d.ts',
      'ios/',
      'android/',
      'RecipeJson/',
      'scripts/ingestion/test-spoon.ps1',
      // Supabase Edge Functions run on Deno — npm: imports + Deno globals
      // are not parseable by the standard ESLint resolver. The shared logic in
      // supabase/functions/_shared/ stays linted.
      'supabase/functions/*/index.ts',
    ],
  },
];
