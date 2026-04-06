import { Environment } from "./shared/helpers/Environment.js";
import { KyselyPool } from "./shared/infrastructure/KyselyPool.js";

// Global test setup
beforeAll(async () => {
  // Initialize test environment
  await Environment.init("test");
});

afterAll(async () => {
  // Clean up database connections
  await KyselyPool.destroyAll();
});

// Mock external services for testing
jest.mock("firebase-admin");
jest.mock("stripe");

// Set test environment variables
process.env.ENVIRONMENT = "test";
process.env.NODE_ENV = "test";
