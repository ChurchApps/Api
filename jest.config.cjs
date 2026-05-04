module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      // The Api's main tsconfig uses module=NodeNext which Jest can't load directly.
      // Compile tests with a Jest-friendly module setting; isolatedModules keeps it fast.
      isolatedModules: true,
      tsconfig: {
        module: 'commonjs',
        target: 'es2022',
        esModuleInterop: true,
        allowJs: true,
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  testTimeout: 10000,
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    // Strip the `.js` suffix that NodeNext-style imports use, so Jest+ts-jest
    // can resolve sibling `.ts` files.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};