import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for schema migrations.
 *
 * Each module has its own database, so DB_MODULE is required for generation.
 *
 * Environment variables:
 *   DB_DIALECT  — "mysql" (default) or "postgres"
 *   DB_MODULE   — module name: membership, attendance, content, giving, messaging, doing
 *
 * Usage:
 *   # Generate migrations for a module (MySQL, default):
 *   DB_MODULE=membership npx drizzle-kit generate
 *
 *   # Generate migrations for a module (PostgreSQL):
 *   DB_DIALECT=postgres DB_MODULE=membership npx drizzle-kit generate
 *
 *   # Generate for all modules at once:
 *   npm run migrate:generate:all
 */

const MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing"];

const dialect = (process.env.DB_DIALECT || "mysql").toLowerCase();
const isPostgres = dialect === "postgres" || dialect === "postgresql" || dialect === "pg";
const dbDialect = isPostgres ? "postgresql" : "mysql";
const moduleName = process.env.DB_MODULE;

if (!moduleName) {
  console.error("DB_MODULE is required. Set it to one of:", MODULES.join(", "));
  console.error("Or use: npm run migrate:generate:all");
  process.exit(1);
}

if (!MODULES.includes(moduleName)) {
  console.error(`Unknown module: ${moduleName}. Valid modules: ${MODULES.join(", ")}`);
  process.exit(1);
}

const schemaPath = isPostgres
  ? `./src/db/schema/pg/${moduleName}.ts`
  : `./src/db/schema/${moduleName}.ts`;

export default defineConfig({
  schema: schemaPath,
  out: `./drizzle/${dbDialect}/${moduleName}`,
  dialect: dbDialect,
});
