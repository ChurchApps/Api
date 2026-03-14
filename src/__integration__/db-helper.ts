/**
 * Helper for integration tests that need database access.
 *
 * Bypasses Environment.init() (which uses import.meta.url, incompatible with ts-jest CJS mode).
 * Instead, directly populates Environment.dbConnections so MultiDatabasePool/getDrizzleDb work.
 *
 * Usage in test files:
 *   import { initTestDb, teardownTestDb, qi } from "../db-helper";
 *   beforeAll(() => initTestDb());
 *   afterAll(() => teardownTestDb());
 */

import { Environment } from "../shared/helpers/Environment.js";
import { MultiDatabasePool } from "../shared/infrastructure/MultiDatabasePool.js";
import { clearDrizzleInstances } from "../db/drizzle.js";
import { DatabaseUrlParser } from "../shared/helpers/DatabaseUrlParser.js";
import { getDialect } from "../shared/helpers/Dialect.js";
import { sql as drizzleSql } from "drizzle-orm";

let initialized = false;

export async function initTestDb() {
  if (initialized) return;

  const modules = ["membership", "attendance", "content", "giving", "messaging", "doing", "reporting"];

  for (const mod of modules) {
    const envVar = `${mod.toUpperCase()}_CONNECTION_STRING`;
    const connString = process.env[envVar];
    if (connString) {
      const dbConfig = DatabaseUrlParser.parseConnectionString(connString);
      Environment.dbConnections.set(mod, dbConfig);
    }
  }

  Environment.currentEnvironment = "test";
  initialized = true;
}

/** Quote a SQL identifier for the current dialect (backticks for MySQL, double-quotes for PG) */
export function qi(name: string): string {
  return getDialect() === "postgres" ? `"${name}"` : `\`${name}\``;
}

/**
 * Build a DELETE FROM table WHERE churchId = 'value' statement with dialect-aware quoting.
 * Only for use in test cleanup (afterAll). Validates inputs to prevent SQL injection.
 */
export function cleanupSql(table: string, churchIdValue: string) {
  if (!/^[a-zA-Z_]\w*$/.test(table)) throw new Error(`Invalid table name: ${table}`);
  if (!/^[\w-]+$/.test(churchIdValue)) throw new Error(`Invalid churchId value: ${churchIdValue}`);
  return drizzleSql.raw(`DELETE FROM ${qi(table)} WHERE ${qi("churchId")} = '${churchIdValue}'`);
}

export async function teardownTestDb() {
  clearDrizzleInstances();
  await MultiDatabasePool.closeAll();
  initialized = false;
}
