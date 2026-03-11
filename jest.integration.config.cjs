module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__integration__/**/*.test.ts',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
      useESM: true,
      diagnostics: { ignoreCodes: [151002] },
    }],
  },
  moduleNameMapper: {
    // Strip .js extensions from imports so ts-jest resolves .ts files
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: ['<rootDir>/src/__integration__/setup.ts'],
  testTimeout: 30000,
};
