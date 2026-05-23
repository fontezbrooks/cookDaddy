/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/', '/ios/', '/android/'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'scripts/ingestion/*.ts',
    'supabase/functions/_shared/*.ts',
    '!**/*.d.ts',
    '!src/**/*.web.{ts,tsx}',
    '!**/__tests__/**',
    '!**/__mocks__/**',
  ],
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    // Workflow §2: "Coverage ≥ 90% lines with budgets per package."
    // Lines is the contract. Branches/functions/statements are tracked but with a
    // slightly softer cap so trivial defensive paths don't extort fake tests —
    // notably the `if (extra.sentryDsn)` and PostHog wrap conditionals at the
    // root layout, which would require jest.isolateModules to cover and that
    // breaks React's hook reconciliation in the test renderer (two React copies).
    global: {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
