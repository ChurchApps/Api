/**
 * Drizzle ORM migration runner.
 *
 * Applies pending migrations from drizzle/<dialect>/<module>/ to each module's database.
 * Supports both MySQL and PostgreSQL based on DB_DIALECT env var.
 *
 * Usage:
 *   npm run migrate                              # Run all pending migrations
 *   npm run migrate -- --module=membership       # Run migrations for one module
 *   npm run migrate:status                       # Show migration status
 *   npm run migrate -- --environment=staging     # Use staging config
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { sql } from "drizzle-orm";
import { migrate as migrateMysql } from "drizzle-orm/mysql2/migrator";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDrizzleDb, clearDrizzleInstances } from "../src/db/drizzle.js";
import { getDialect } from "../src/shared/helpers/Dialect.js";
import { Environment } from "../src/shared/helpers/Environment.js";
import { MultiDatabasePool } from "../src/shared/infrastructure/MultiDatabasePool.js";

const MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing"] as const;

function parseArgs(): { module?: string; statusOnly: boolean; environment: string } {
  const args = process.argv.slice(2);
  let module: string | undefined;
  let statusOnly = false;
  let environment = process.env.ENVIRONMENT || "dev";

  for (const arg of args) {
    if (arg.startsWith("--module=")) {
      module = arg.split("=")[1];
      if (!MODULES.includes(module as any)) {
        console.error(`Unknown module: ${module}. Valid modules: ${MODULES.join(", ")}`);
        process.exit(1);
      }
    }
    if (arg === "--status") statusOnly = true;
    if (arg.startsWith("--environment=")) environment = arg.split("=")[1];
  }

  return { module, statusOnly, environment };
}

function getMigrationsFolder(moduleName: string): string | null {
  const dialect = getDialect() === "postgres" ? "postgresql" : "mysql";
  const folder = resolve(process.cwd(), `drizzle/${dialect}/${moduleName}`);
  return existsSync(folder) ? folder : null;
}

async function runMigrations(moduleName: string): Promise<{ applied: boolean; error?: string }> {
  const folder = getMigrationsFolder(moduleName);
  if (!folder) return { applied: false, error: "no migrations directory" };

  const db = getDrizzleDb(moduleName);
  const config = { migrationsFolder: folder, migrationsTable: "__drizzle_migrations" };

  try {
    if (getDialect() === "postgres") {
      await migratePg(db as PostgresJsDatabase, config);
    } else {
      await migrateMysql(db as MySql2Database, config);
    }
    return { applied: true };
  } catch (error: any) {
    return { applied: false, error: error.message };
  }
}

async function showStatus(moduleName: string): Promise<void> {
  const folder = getMigrationsFolder(moduleName);
  if (!folder) {
    console.log(`  ${moduleName}: no migrations directory`);
    return;
  }

  const db = getDrizzleDb(moduleName) as any;
  try {
    let rows: any[];
    if (getDialect() === "postgres") {
      rows = await db.execute(
        sql`SELECT hash, created_at FROM "__drizzle_migrations" ORDER BY created_at`
      );
    } else {
      const result = await db.execute(
        sql`SELECT hash, created_at FROM \`__drizzle_migrations\` ORDER BY created_at`
      );
      rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    }
    console.log(`  ${moduleName}: ${rows.length} migration(s) applied`);
    for (const row of rows) {
      console.log(`    - ${row.hash} (${row.created_at})`);
    }
  } catch {
    console.log(`  ${moduleName}: no migrations applied yet`);
  }
}

async function main() {
  const { module: targetModule, statusOnly, environment } = parseArgs();
  const dialect = getDialect();
  const dialectLabel = dialect === "postgres" ? "PostgreSQL" : "MySQL";

  console.log(`\nDrizzle migrations (${dialectLabel})\n`);

  await Environment.init(environment);

  const modules = targetModule ? [targetModule] : [...MODULES];

  if (statusOnly) {
    console.log("Migration status:");
    for (const mod of modules) {
      await showStatus(mod);
    }
  } else {
    console.log("Running pending migrations...\n");
    let hasErrors = false;

    for (const mod of modules) {
      process.stdout.write(`  ${mod}: `);
      const result = await runMigrations(mod);

      if (result.applied) {
        console.log("✓ up to date");
      } else if (result.error === "no migrations directory") {
        console.log("⊘ no migrations");
      } else {
        console.log(`✗ ${result.error}`);
        hasErrors = true;
      }
    }

    if (hasErrors) {
      console.log("\nSome migrations failed. Check errors above.");
      process.exitCode = 1;
    } else {
      console.log("\nAll migrations applied successfully.");
    }
  }

  clearDrizzleInstances();
  await MultiDatabasePool.closeAll();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
