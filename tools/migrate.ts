import * as path from "path";
import { fileURLToPath } from "url";
import { Migrator, FileMigrationProvider } from "kysely";
import * as fs from "fs";
import {
  MODULE_NAMES,
  type ModuleName,
  ensureEnvironment,
  createKyselyForModule,
  ensureDatabaseExists,
} from "./migrations/kysely-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrateOptions {
  module?: ModuleName;
  action: "up" | "down" | "status";
}

function parseArguments(): MigrateOptions {
  const args = process.argv.slice(2);
  const options: MigrateOptions = { action: "up" };

  for (const arg of args) {
    if (arg.startsWith("--module=")) {
      const mod = arg.split("=")[1] as ModuleName;
      if (!MODULE_NAMES.includes(mod)) {
        console.error(`Invalid module: ${mod}`);
        console.error(`Valid modules: ${MODULE_NAMES.join(", ")}`);
        process.exit(1);
      }
      options.module = mod;
    } else if (arg.startsWith("--action=")) {
      const action = arg.split("=")[1];
      if (!["up", "down", "status"].includes(action)) {
        console.error(`Invalid action: ${action}. Use up, down, or status.`);
        process.exit(1);
      }
      options.action = action as "up" | "down" | "status";
    }
  }

  return options;
}

async function getMigrator(moduleName: ModuleName) {
  const migrationsPath = path.join(__dirname, "migrations", moduleName);

  if (!fs.existsSync(migrationsPath)) {
    console.log(`  No migrations directory for ${moduleName}, skipping...`);
    return null;
  }

  const db = createKyselyForModule(moduleName);
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs: fs.promises, path, migrationFolder: migrationsPath }),
  });

  return { db, migrator };
}

async function migrateUp(moduleName: ModuleName) {
  console.log(`\n[${moduleName}] Ensuring database exists...`);
  await ensureDatabaseExists(moduleName);

  const result = await getMigrator(moduleName);
  if (!result) return;
  const { db, migrator } = result;

  try {
    console.log(`[${moduleName}] Running migrations...`);
    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((r) => {
      if (r.status === "Success") {
        console.log(`  [${moduleName}] Applied: ${r.migrationName}`);
      } else if (r.status === "Error") {
        console.error(`  [${moduleName}] Failed: ${r.migrationName}`);
      }
    });

    if (error) {
      console.error(`[${moduleName}] Migration failed:`, error);
      throw error;
    }

    if (!results?.length) {
      console.log(`  [${moduleName}] Already up to date.`);
    }
  } finally {
    await db.destroy();
  }
}

async function migrateDown(moduleName: ModuleName) {
  const result = await getMigrator(moduleName);
  if (!result) return;
  const { db, migrator } = result;

  try {
    console.log(`[${moduleName}] Rolling back last migration...`);
    const { error, results } = await migrator.migrateDown();

    results?.forEach((r) => {
      if (r.status === "Success") {
        console.log(`  [${moduleName}] Reverted: ${r.migrationName}`);
      } else if (r.status === "Error") {
        console.error(`  [${moduleName}] Revert failed: ${r.migrationName}`);
      }
    });

    if (error) {
      console.error(`[${moduleName}] Rollback failed:`, error);
      throw error;
    }

    if (!results?.length) {
      console.log(`  [${moduleName}] No migrations to revert.`);
    }
  } finally {
    await db.destroy();
  }
}

async function migrateStatus(moduleName: ModuleName) {
  const result = await getMigrator(moduleName);
  if (!result) return;
  const { db, migrator } = result;

  try {
    const migrations = await migrator.getMigrations();
    console.log(`\n[${moduleName}] Migration status:`);
    for (const m of migrations) {
      const status = m.executedAt ? `Applied (${m.executedAt.toISOString()})` : "Pending";
      console.log(`  ${m.name}: ${status}`);
    }
    if (migrations.length === 0) {
      console.log(`  No migrations found.`);
    }
  } finally {
    await db.destroy();
  }
}

async function main() {
  const options = parseArguments();

  try {
    await ensureEnvironment();

    const modules = options.module ? [options.module] : [...MODULE_NAMES];

    for (const moduleName of modules) {
      switch (options.action) {
        case "up":
          await migrateUp(moduleName);
          break;
        case "down":
          await migrateDown(moduleName);
          break;
        case "status":
          await migrateStatus(moduleName);
          break;
      }
    }

    console.log("\nDone.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
