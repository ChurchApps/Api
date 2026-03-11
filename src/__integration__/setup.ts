/**
 * Integration test setup — connects to the Docker MySQL instance.
 *
 * Requires `docker compose up mysql` to be running.
 * Connection defaults match docker-compose.yml (root/b1stack_root on localhost:3306).
 *
 * Override with env vars:
 *   TEST_MYSQL_HOST, TEST_MYSQL_PORT, TEST_MYSQL_USER, TEST_MYSQL_PASSWORD
 */

const host = process.env.TEST_MYSQL_HOST || "127.0.0.1";
const port = process.env.TEST_MYSQL_PORT || "3306";
const user = process.env.TEST_MYSQL_USER || "root";
const password = process.env.TEST_MYSQL_PASSWORD || "b1stack_root";

const modules = ["membership", "attendance", "content", "giving", "messaging", "doing", "reporting"];

for (const mod of modules) {
  const envVar = `${mod.toUpperCase()}_CONNECTION_STRING`;
  if (!process.env[envVar]) {
    process.env[envVar] = `mysql://${user}:${password}@${host}:${port}/${mod}`;
  }
}

// Suppress verbose Environment.init() logging in tests
process.env.ENVIRONMENT = "test";
process.env.NODE_ENV = "test";
process.env.ENCRYPTION_KEY = "test-encryption-key";
process.env.JWT_SECRET = "test-jwt-secret";
