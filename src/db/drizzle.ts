import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { MultiDatabasePool } from "../shared/infrastructure/MultiDatabasePool.js";
import { getDialect } from "../shared/helpers/Dialect.js";

/** Union type for both database dialects */
export type AnyDatabase = MySql2Database<any> | PostgresJsDatabase<any>;

const instances = new Map<string, AnyDatabase>();

/**
 * Get a Drizzle ORM instance for a module's database.
 * Returns either a MySQL or PostgreSQL Drizzle instance based on DB_DIALECT.
 *
 * Note: boolean columns use Drizzle's boolean() which maps to tinyint(1) in MySQL.
 * The actual DB uses BIT(1), but MultiDatabasePool's typeCast converts BIT(1)
 * to JS booleans at the driver level, so Drizzle reads correct values.
 * For PostgreSQL, boolean columns are native — no typeCast needed.
 */
export function getDrizzleDb(moduleName: string): AnyDatabase {
  let db = instances.get(moduleName);
  if (!db) {
    if (getDialect() === "postgres") {
      const client = MultiDatabasePool.getPgClient(moduleName);
      db = drizzlePg(client);
    } else {
      const pool = MultiDatabasePool.getPool(moduleName);
      db = drizzleMysql(pool);
    }
    instances.set(moduleName, db);
  }
  return db;
}

/**
 * Clear cached Drizzle instances (useful for tests or pool reset).
 */
export function clearDrizzleInstances() {
  instances.clear();
}
