import {
  MODULE_NAMES,
  type ModuleName,
  ensureEnvironment,
  createKyselyForModule,
} from "./migrations/kysely-config.js";
import { sql } from "kysely";

interface BaselineOptions {
  module?: ModuleName;
}

function parseArguments(): BaselineOptions {
  const args = process.argv.slice(2);
  const options: BaselineOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--module=")) {
      const mod = arg.split("=")[1] as ModuleName;
      if (!MODULE_NAMES.includes(mod)) {
        console.error(`Invalid module: ${mod}`);
        console.error(`Valid modules: ${MODULE_NAMES.join(", ")}`);
        process.exit(1);
      }
      options.module = mod;
    }
  }

  return options;
}

async function baselineModule(moduleName: ModuleName) {
  const db = createKyselyForModule(moduleName);

  try {
    // Create the kysely_migration table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS \`kysely_migration\` (
        \`name\` varchar(255) NOT NULL,
        \`timestamp\` varchar(255) NOT NULL,
        PRIMARY KEY (\`name\`)
      )
    `.execute(db);

    // Create the kysely_migration_lock table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS \`kysely_migration_lock\` (
        \`id\` varchar(255) NOT NULL,
        \`is_locked\` integer NOT NULL DEFAULT 0,
        PRIMARY KEY (\`id\`)
      )
    `.execute(db);

    // Check if baseline already applied
    const existing = await sql<{ name: string }>`
      SELECT name FROM kysely_migration WHERE name = '2026-02-06_initial_schema'
    `.execute(db);

    if (existing.rows.length > 0) {
      console.log(`  [${moduleName}] Baseline already applied.`);
      return;
    }

    // Insert baseline record
    await sql`
      INSERT INTO kysely_migration (name, timestamp)
      VALUES ('2026-02-06_initial_schema', ${new Date().toISOString()})
    `.execute(db);

    console.log(`  [${moduleName}] Baseline applied — 2026-02-06_initial_schema marked as executed.`);
  } finally {
    await db.destroy();
  }
}

async function main() {
  const options = parseArguments();

  try {
    await ensureEnvironment();

    const modules = options.module ? [options.module] : [...MODULE_NAMES];

    console.log("Applying baseline to existing databases...\n");

    for (const moduleName of modules) {
      await baselineModule(moduleName);
    }

    console.log("\nDone. Future migrations will run normally.");
  } catch (error) {
    console.error("Baseline failed:", error);
    process.exit(1);
  }
}

main();
