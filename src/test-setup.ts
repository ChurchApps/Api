// Lazy-import Environment and DB helpers: import.meta.url (ESM) would crash CommonJS bootstrap.
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

// firebase-admin removed: wasn't installed, mock broke jest resolve
jest.mock("stripe");
process.env.ENVIRONMENT = "test";
process.env.NODE_ENV = "test";
