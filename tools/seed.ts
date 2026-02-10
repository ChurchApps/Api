import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  MODULE_NAMES,
  type ModuleName,
  ensureEnvironment,
  createKyselyForModule,
} from "./migrations/kysely-config.js";
import { sql } from "kysely";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SeedOptions {
  module?: ModuleName;
  reset: boolean;
}

function parseArguments(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = { reset: false };

  for (const arg of args) {
    if (arg.startsWith("--module=")) {
      const mod = arg.split("=")[1] as ModuleName;
      if (!MODULE_NAMES.includes(mod)) {
        console.error(`Invalid module: ${mod}`);
        console.error(`Valid modules: ${MODULE_NAMES.join(", ")}`);
        process.exit(1);
      }
      options.module = mod;
    } else if (arg === "--reset") {
      options.reset = true;
    }
  }

  return options;
}

function splitSqlStatements(sqlContent: string): string[] {
  const statements: string[] = [];
  const lines = sqlContent.split("\n");
  let current = "";

  for (const line of lines) {
    if (line.trim() === "" || line.trim().startsWith("--")) continue;

    current += line + "\n";
    if (line.trim().endsWith(";")) {
      if (current.trim()) {
        statements.push(current.trim());
        current = "";
      }
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements.filter((s) => s.length > 0);
}

async function seedModule(moduleName: ModuleName, reset: boolean) {
  const demoPath = path.join(__dirname, "dbScripts", moduleName, "demo.sql");

  if (!fs.existsSync(demoPath)) {
    console.log(`  [${moduleName}] No demo.sql found, skipping...`);
    return;
  }

  const db = createKyselyForModule(moduleName);

  try {
    if (reset) {
      console.log(`  [${moduleName}] Reset requested — demo data will overwrite via INSERT IGNORE / REPLACE`);
    }

    console.log(`  [${moduleName}] Loading demo data from demo.sql...`);
    const sqlContent = fs.readFileSync(demoPath, "utf8");

    if (sqlContent.trim().length < 50 || sqlContent.includes("-- This file will be populated")) {
      console.log(`  [${moduleName}] demo.sql is a placeholder, skipping...`);
      return;
    }

    const statements = splitSqlStatements(sqlContent);
    let executed = 0;

    for (const stmt of statements) {
      await sql.raw(stmt).execute(db);
      executed++;
    }

    console.log(`  [${moduleName}] Executed ${executed} statements.`);
  } finally {
    await db.destroy();
  }
}

async function main() {
  const options = parseArguments();

  try {
    await ensureEnvironment();

    const modules = options.module ? [options.module] : [...MODULE_NAMES];

    console.log("Seeding demo data...\n");

    for (const moduleName of modules) {
      await seedModule(moduleName, options.reset);
    }

    console.log("\nDone.");
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
}

main();
