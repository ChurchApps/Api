import { Environment } from "./shared/helpers/Environment";
import { ConnectionManager } from "./shared/infrastructure/ConnectionManager";

// Global test setup
beforeAll(async () => {
  // Initialize test environment
  await Environment.init("test");
});

afterAll(async () => {
  // Clean up database connections
  await ConnectionManager.closeAll();
});

// Mock external services for testing
jest.mock("firebase-admin");
jest.mock("stripe");

// Set test environment variables
process.env.ENVIRONMENT = "test";
process.env.NODE_ENV = "test";
