/**
 * Integration test setup — connects to the Docker database instance.
 *
 * MySQL (default): Requires `docker compose up mysql` to be running.
 *   Connection defaults match docker-compose.yml (root/b1stack_root on localhost:3306).
 *   Override with env vars: TEST_MYSQL_HOST, TEST_MYSQL_PORT, TEST_MYSQL_USER, TEST_MYSQL_PASSWORD
 *
 * PostgreSQL (opt-in): Set DB_DIALECT=postgres. Requires `docker compose --profile postgres up`.
 *   Override with env vars: TEST_PG_HOST, TEST_PG_PORT, TEST_PG_USER, TEST_PG_PASSWORD, TEST_PG_DATABASE
 */

const dialect = (process.env.DB_DIALECT || "mysql").toLowerCase();
const modules = ["membership", "attendance", "content", "giving", "messaging", "doing", "reporting"];

if (dialect === "postgres" || dialect === "postgresql" || dialect === "pg") {
  const host = process.env.TEST_PG_HOST || "127.0.0.1";
  const port = process.env.TEST_PG_PORT || "5432";
  const user = process.env.TEST_PG_USER || "b1stack";
  const password = process.env.TEST_PG_PASSWORD || "b1stack_pass";
  const database = process.env.TEST_PG_DATABASE || "b1stack";

  for (const mod of modules) {
    const envVar = `${mod.toUpperCase()}_CONNECTION_STRING`;
    if (!process.env[envVar]) {
      process.env[envVar] = `postgresql://${user}:${password}@${host}:${port}/${database}`;
    }
  }
} else {
  const host = process.env.TEST_MYSQL_HOST || "127.0.0.1";
  const port = process.env.TEST_MYSQL_PORT || "3306";
  const user = process.env.TEST_MYSQL_USER || "root";
  const password = process.env.TEST_MYSQL_PASSWORD || "b1stack_root";

  for (const mod of modules) {
    const envVar = `${mod.toUpperCase()}_CONNECTION_STRING`;
    if (!process.env[envVar]) {
      process.env[envVar] = `mysql://${user}:${password}@${host}:${port}/${mod}`;
    }
  }
}

// Suppress verbose Environment.init() logging in tests
process.env.ENVIRONMENT = "test";
process.env.NODE_ENV = "test";
process.env.ENCRYPTION_KEY = "test-encryption-key";
process.env.JWT_SECRET = "test-jwt-secret";
