// Global test setup. Lazily import the Environment + DB helpers because they use
// `import.meta.url` (ESM) and would otherwise crash this CommonJS-transformed
// test bootstrap. Tests that mock at the unit level don't need them at all;
// tests that need real DB/env will await these inside their own beforeAll.
beforeAll(async () => {
  try {
    const { Environment } = await import("./shared/helpers/Environment.js");
    await Environment.init("test");
  } catch { /* unit tests don't need it */ }
});

afterAll(async () => {
  try {
    const { KyselyPool } = await import("./shared/infrastructure/KyselyPool.js");
    await KyselyPool.destroyAll();
  } catch { /* nothing to clean up */ }
});

// Mock external services for testing. (firebase-admin removed — not installed
// and not referenced anywhere in the Api source; the mock just made jest fail
// to resolve.)
jest.mock("stripe");

// Set test environment variables
process.env.ENVIRONMENT = "test";
process.env.NODE_ENV = "test";
