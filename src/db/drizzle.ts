import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { MultiDatabasePool } from "../shared/infrastructure/MultiDatabasePool.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const instances = new Map<string, MySql2Database<any>>();

/**
 * Get a Drizzle ORM instance for a module's database.
 * Reuses the existing mysql2 pools from MultiDatabasePool — zero extra connections.
 *
 * Note: boolean columns use Drizzle's boolean() which maps to tinyint(1).
 * The actual DB uses BIT(1), but MultiDatabasePool's typeCast converts BIT(1)
 * to JS booleans at the driver level, so Drizzle reads correct values.
 * For schema generation/migration, use drizzle-kit introspect to verify.
 */
export function getDrizzleDb(moduleName: string): MySql2Database {
  let db = instances.get(moduleName);
  if (!db) {
    const pool = MultiDatabasePool.getPool(moduleName);
    db = drizzle(pool);
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
