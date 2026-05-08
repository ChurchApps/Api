import * as path from "path";
import * as fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { Migrator, type Migration, type MigrationProvider } from "kysely";
import { ensureEnvironment, createKysely, ensureDatabaseExists, getModules } from "./kysely-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Drop-in replacement for kysely's FileMigrationProvider that imports each
// migration via a file:// URL. Plain Windows absolute paths (e.g. `D:\foo`)
// fail Node's ESM loader with ERR_UNSUPPORTED_ESM_URL_SCHEME because they
// aren't valid URL schemes. The standard provider hits this on Windows; this
// wrapper sidesteps it by converting paths before `await import()`.
class FileURLMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const result: Record<string, Migration> = {};
    const files = await fs.promises.readdir(this.migrationFolder);
    for (const fileName of files) {
      if (!/\.(js|ts|mjs|cjs)$/.test(fileName)) continue;
      const filePath = path.resolve(this.migrationFolder, fileName);
      const url = pathToFileURL(filePath).href;
      const mod = await import(url);
      const name = fileName.replace(/\.(js|ts|mjs|cjs)$/, "");
      result[name] = mod as Migration;
    }
    return result;
  }
}

type Action = "up" | "down" | "status";

function parseArguments(): { action: Action; module: string } {
  const args = process.argv.slice(2);
  let action: Action = "up";
  let module = "";

  for (const arg of args) {
    if (arg.startsWith("--action=")) {
      const val = arg.split("=")[1];
      if (!["up", "down", "status"].includes(val)) {
        console.error(`Invalid action: ${val}. Use up, down, or status.`);
        process.exit(1);
      }
      action = val as Action;
    }
    if (arg.startsWith("--module=")) {
      module = arg.split("=")[1];
    }
  }

  if (!module) {
    console.error("--module is required (e.g. --module=attendance or --module=all)");
    process.exit(1);
  }

  return { action, module };
}

async function getMigrator(moduleName: string) {
  const migrationsPath = path.join(__dirname, "migrations", moduleName);

  if (!fs.existsSync(migrationsPath)) {
    return null;
  }

  const db = createKysely(moduleName);
  const migrator = new Migrator({
    db,
    provider: new FileURLMigrationProvider(migrationsPath),
  });

  return { db, migrator };
}

async function migrateUp(moduleName: string) {
  console.log(`\n[${moduleName}] Ensuring database exists...`);
  await ensureDatabaseExists(moduleName);

  const result = await getMigrator(moduleName);
  if (!result) {
    console.log(`[${moduleName}] No migrations directory found, skipping.`);
    return;
  }
  const { db, migrator } = result;

  try {
    console.log(`[${moduleName}] Running migrations...`);
    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((r) => {
      if (r.status === "Success") {
        console.log(`  Applied: ${r.migrationName}`);
      } else if (r.status === "Error") {
        console.error(`  Failed: ${r.migrationName}`);
      }
    });

    if (error) {
      console.error(`[${moduleName}] Migration failed:`, error);
      throw error;
    }

    if (!results?.length) {
      console.log(`  Already up to date.`);
    }
  } finally {
    await db.destroy();
  }
}

async function migrateDown(moduleName: string) {
  const result = await getMigrator(moduleName);
  if (!result) {
    console.log(`[${moduleName}] No migrations directory found, skipping.`);
    return;
  }
  const { db, migrator } = result;

  try {
    console.log(`\n[${moduleName}] Rolling back last migration...`);
    const { error, results } = await migrator.migrateDown();

    results?.forEach((r) => {
      if (r.status === "Success") {
        console.log(`  Reverted: ${r.migrationName}`);
      } else if (r.status === "Error") {
        console.error(`  Revert failed: ${r.migrationName}`);
      }
    });

    if (error) {
      console.error(`[${moduleName}] Rollback failed:`, error);
      throw error;
    }

    if (!results?.length) {
      console.log(`  No migrations to revert.`);
    }
  } finally {
    await db.destroy();
  }
}

async function migrateStatus(moduleName: string) {
  const result = await getMigrator(moduleName);
  if (!result) {
    console.log(`[${moduleName}] No migrations directory found, skipping.`);
    return;
  }
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

async function runForModule(moduleName: string, action: Action) {
  switch (action) {
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

async function main() {
  const { action, module: moduleName } = parseArguments();

  try {
    await ensureEnvironment();

    if (moduleName === "all") {
      for (const mod of getModules()) {
        await runForModule(mod, action);
      }
    } else {
      await runForModule(moduleName, action);
    }

    console.log("\nDone.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
