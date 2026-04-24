import { Environment } from "../src/shared/helpers/Environment.js";
import { KyselyPool } from "../src/shared/infrastructure/KyselyPool.js";
import { sql } from "kysely";
import { Migrator, type MigrationProvider } from "kysely";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mysql from "mysql2/promise";
import { ensureEnvironment, createKysely, ensureDatabaseExists } from "./kysely-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing"] as const;

// Demo data files per module (the only dbScripts still used)
const moduleDemoFiles: Record<string, string[]> = {
  membership: ["demo.sql", "populateData.sql"],
  attendance: ["demo.sql"],
  content: ["demo.sql"],
  giving: ["demo.sql"],
  messaging: ["demo.sql"],
  doing: ["demo.sql"],
};

export interface InitOptions {
  module?: string;
  reset?: boolean;
  environment?: string;
  demoOnly?: boolean;
  schemaOnly?: boolean;
}

export async function initializeDatabases(options: InitOptions = {}) {
  try {
    await ensureEnvironment();

    if (options.reset) {
      console.log("Resetting all databases...");
      await resetDatabases(options);
      return;
    }

    const modules = options.module ? [options.module] : [...MODULES];

    console.log(`Initializing databases: ${modules.join(", ")}`);

    for (const moduleName of modules) {
      if (!MODULES.includes(moduleName as any)) {
        console.error(`Invalid module: ${moduleName}. Valid: ${MODULES.join(", ")}`);
        process.exit(1);
      }

      console.log(`\n--- ${moduleName} ---`);

      if (!options.demoOnly) {
        // Run Kysely migrations for schema
        await runMigrations(moduleName);
      }

      if (!options.schemaOnly) {
        // Load demo data from SQL scripts
        await loadDemoData(moduleName);
      }
    }

    console.log("\nAll databases initialized successfully!");
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
}

async function runMigrations(moduleName: string) {
  console.log(`  Running migrations...`);
  await ensureDatabaseExists(moduleName);

  const migrationsPath = path.join(__dirname, "migrations", moduleName);
  if (!fs.existsSync(migrationsPath)) {
    console.log(`  No migrations directory found, skipping schema.`);
    return;
  }

  const db = createKysely(moduleName);
  // Custom provider instead of Kysely's FileMigrationProvider: the built-in
  // version calls `import()` with a raw OS path, which fails on Windows ESM
  // (`ERR_UNSUPPORTED_ESM_URL_SCHEME` for `d:\...`). We convert to a file:// URL.
  const provider: MigrationProvider = {
    async getMigrations() {
      const migrations: Record<string, any> = {};
      const files = (await fs.promises.readdir(migrationsPath)).sort();
      for (const fileName of files) {
        const isMigrationFile =
          fileName.endsWith(".js") ||
          fileName.endsWith(".mjs") ||
          (fileName.endsWith(".ts") && !fileName.endsWith(".d.ts")) ||
          (fileName.endsWith(".mts") && !fileName.endsWith(".d.mts"));
        if (!isMigrationFile) continue;

        const absolutePath = path.join(migrationsPath, fileName);
        const fileUrl = pathToFileURL(absolutePath).href;
        const mod = await import(fileUrl);
        const migration = mod?.default && typeof mod.default.up === "function" ? mod.default : mod;
        if (migration && typeof migration.up === "function") {
          const key = fileName.substring(0, fileName.lastIndexOf("."));
          migrations[key] = migration;
        }
      }
      return migrations;
    },
  };
  const migrator = new Migrator({ db, provider });

  try {
    const { error, results } = await migrator.migrateToLatest();

    results?.forEach((r) => {
      if (r.status === "Success") {
        console.log(`  Applied: ${r.migrationName}`);
      } else if (r.status === "Error") {
        console.error(`  Failed: ${r.migrationName}`);
      }
    });

    if (error) throw error;
    if (!results?.length) console.log(`  Already up to date.`);
  } finally {
    await db.destroy();
  }
}

async function loadDemoData(moduleName: string) {
  const demoFiles = moduleDemoFiles[moduleName] || [];
  if (demoFiles.length === 0) return;

  const scriptsPath = path.join(__dirname, "dbScripts", moduleName);
  if (!fs.existsSync(scriptsPath)) return;

  const db = createKysely(moduleName);

  try {
    for (const file of demoFiles) {
      const filePath = path.join(scriptsPath, file);
      if (!fs.existsSync(filePath)) {
        console.log(`  Demo file ${file} not found, skipping.`);
        continue;
      }

      console.log(`  Loading demo data: ${file}`);
      const sqlContent = fs.readFileSync(filePath, "utf8");

      if (sqlContent.includes("-- This file will be populated") || sqlContent.trim().length < 50) {
        console.log(`  Skipping placeholder: ${file}`);
        continue;
      }

      const statements = splitSqlStatements(sqlContent);
      for (const statement of statements) {
        const clean = statement.trim();
        if (clean && !clean.startsWith("--")) {
          await sql.raw(clean).execute(db);
        }
      }
    }
  } finally {
    await db.destroy();
  }
}

async function resetDatabases(options: InitOptions = {}) {
  console.log("WARNING: This will drop and recreate all databases!");

  const modules = options.module ? [options.module] : [...MODULES];

  for (const moduleName of modules) {
    const envVar = `${moduleName.toUpperCase()}_CONNECTION_STRING`;
    const connString = process.env[envVar];
    if (!connString) {
      console.log(`  No connection string for ${moduleName}, skipping.`);
      continue;
    }

    // Parse to get db name for drop/create
    const { DatabaseUrlParser } = await import("../src/shared/helpers/DatabaseUrlParser.js");
    const dbConfig = DatabaseUrlParser.parseConnectionString(connString);

    const connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port || 3306,
    });

    try {
      console.log(`\n  Dropping ${dbConfig.database}...`);
      await connection.execute(`DROP DATABASE IF EXISTS \`${dbConfig.database}\``);
      console.log(`  Creating ${dbConfig.database}...`);
      await connection.execute(`CREATE DATABASE \`${dbConfig.database}\``);
    } finally {
      await connection.end();
    }

    // Re-run migrations + demo data
    await runMigrations(moduleName);
    if (!options.schemaOnly) {
      await loadDemoData(moduleName);
    }
  }

  console.log("\nDatabase reset completed!");
}

function splitSqlStatements(sqlText: string): string[] {
  const statements: string[] = [];
  const lines = sqlText.split("\n");
  let current = "";
  let inProcedure = false;
  let procedureContent = "";

  for (const line of lines) {
    const trimmedLine = line.trim().toUpperCase();

    if (line.trim() === "" || line.trim().startsWith("--") || line.trim().startsWith("/*")) continue;

    if (trimmedLine.startsWith("CREATE PROCEDURE") || trimmedLine.startsWith("CREATE FUNCTION") || trimmedLine.startsWith("CREATE DEFINER")) {
      inProcedure = true;
      procedureContent = line + "\n";
      continue;
    }

    if (trimmedLine.startsWith("DROP PROCEDURE") || trimmedLine.startsWith("DROP FUNCTION")) {
      statements.push(line);
      continue;
    }

    if (trimmedLine.startsWith("DELIMITER")) continue;

    if (inProcedure) {
      procedureContent += line + "\n";
      if (trimmedLine === "END" || trimmedLine === "END;" || trimmedLine === "END$$" || trimmedLine === "END//" || trimmedLine.match(/^END\s*(\/\/|\$\$)/)) {
        let cleanProc = procedureContent.trim();
        cleanProc = cleanProc.replace(/\s*(\/\/|\$\$)\s*$/, "");
        statements.push(cleanProc);
        procedureContent = "";
        inProcedure = false;
      }
    } else {
      current += line + "\n";
      if (line.trim().endsWith(";")) {
        if (current.trim()) {
          statements.push(current.trim());
          current = "";
        }
      }
    }
  }

  if (current.trim()) statements.push(current.trim());
  if (procedureContent.trim()) statements.push(procedureContent.trim());

  return statements.filter((stmt) => stmt.length > 0);
}

function parseArguments(): InitOptions {
  const args = process.argv.slice(2);
  const options: InitOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--module=")) options.module = arg.split("=")[1];
    else if (arg === "--reset") options.reset = true;
    else if (arg.startsWith("--environment=")) options.environment = arg.split("=")[1];
    else if (arg === "--demo-only") options.demoOnly = true;
    else if (arg === "--schema-only") options.schemaOnly = true;
  }

  if (options.module && !MODULES.includes(options.module as any)) {
    console.error(`Invalid module: ${options.module}. Valid: ${MODULES.join(", ")}`);
    process.exit(1);
  }

  return options;
}

// Main execution
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const options = parseArguments();
  initializeDatabases(options);
}
