import { Environment } from "../src/shared/helpers/Environment.js";
import { ConnectionManager } from "../src/shared/infrastructure/ConnectionManager.js";
import { MultiDatabasePool } from "../src/shared/infrastructure/MultiDatabasePool.js";
import { getDrizzleDb, clearDrizzleInstances } from "../src/db/drizzle.js";
import { getDialect } from "../src/shared/helpers/Dialect.js";
import { migrate as migrateMysql } from "drizzle-orm/mysql2/migrator";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing"] as const;

/** Demo/seed data and stored procedures per module (loaded from tools/dbScripts/) */
const moduleExtras: Record<string, {
  demoTables: { title: string; file: string }[];
  storedProcs?: { title: string; file: string }[];
}> = {
  membership: {
    demoTables: [
      { title: "Demo Data", file: "demo.sql" },
      { title: "Populate Data", file: "populateData.sql" },
    ]
  },
  attendance: { demoTables: [{ title: "Demo Data", file: "demo.sql" }] },
  content: { demoTables: [{ title: "Demo Data", file: "demo.sql" }] },
  giving: { demoTables: [{ title: "Demo Data", file: "demo.sql" }] },
  messaging: {
    demoTables: [{ title: "Demo Data", file: "demo.sql" }],
    storedProcs: [
      { title: "Cleanup", file: "cleanup.sql" },
      { title: "Delete For Church", file: "deleteForChurch.sql" },
      { title: "Update Conversation Stats", file: "updateConversationStats.sql" },
    ]
  },
  doing: { demoTables: [{ title: "Demo Data", file: "demo.sql" }] }
};

interface InitOptions {
  module?: string;
  reset?: boolean;
  environment?: string;
  demoOnly?: boolean;
  schemaOnly?: boolean;
}

async function initializeDatabases(options: InitOptions = {}) {
  try {
    const environment = options.environment || process.env.ENVIRONMENT || 'dev';
    await Environment.init(environment);

    if (options.reset) {
      console.log('🔥 Resetting all databases...');
      await resetDatabases(options);
      return;
    }

    if (options.module) {
      console.log(`🔧 Initializing ${options.module} database...`);
      await initializeModuleDatabase(options.module, options);
      console.log(`✅ ${options.module} database initialization completed!`);
      return;
    }

    console.log('🚀 Initializing Core API databases...');
    console.log(`📋 Module order: ${MODULES.join(' → ')}`);

    for (const moduleName of MODULES) {
      console.log(`\n🔧 Initializing ${moduleName} database...`);
      await initializeModuleDatabase(moduleName, options);
    }

    console.log('\n✅ All databases initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    clearDrizzleInstances();
    await ConnectionManager.closeAll();
    await MultiDatabasePool.closeAll();
  }
}

async function initializeModuleDatabase(moduleName: string, options: InitOptions = {}) {
  try {
    const dbConfig = Environment.getDatabaseConfig(moduleName);
    if (!dbConfig) {
      console.log(`⚠️  No database configuration found for ${moduleName}, skipping...`);
      return;
    }

    // Ensure the database/schema exists
    await ensureDatabaseExists(moduleName, dbConfig);

    if (options.demoOnly) {
      await loadDemoData(moduleName);
    } else {
      // Run drizzle-kit migrations (creates/updates tables)
      await runMigrations(moduleName);

      // Run stored procedures (MySQL only)
      await loadStoredProcs(moduleName);
    }

    console.log(`   ✅ ${moduleName} database initialized successfully`);
  } catch (error) {
    console.error(`   ❌ Failed to initialize ${moduleName} database:`, error);
    throw error;
  }
}

/** Apply drizzle-kit migrations for a module */
async function runMigrations(moduleName: string) {
  const dialect = getDialect() === "postgres" ? "postgresql" : "mysql";
  const migrationsFolder = path.resolve(__dirname, `../drizzle/${dialect}/${moduleName}`);

  if (!fs.existsSync(migrationsFolder)) {
    console.log(`   ⚠️  No migrations found for ${moduleName} (${dialect}), skipping...`);
    return;
  }

  console.log(`   📦 Running migrations (${dialect})...`);
  const db = getDrizzleDb(moduleName);
  const config = { migrationsFolder, migrationsTable: "__drizzle_migrations" };

  if (getDialect() === "postgres") {
    await migratePg(db as PostgresJsDatabase, config);
  } else {
    await migrateMysql(db as MySql2Database, config);
  }
  console.log(`   ✅ Migrations applied`);
}

/** Load stored procedures from SQL files (MySQL only — skipped on PG) */
async function loadStoredProcs(moduleName: string) {
  const extras = moduleExtras[moduleName];
  if (!extras?.storedProcs || extras.storedProcs.length === 0) return;

  const isPg = getDialect() === "postgres";
  if (isPg) {
    console.log(`   ⏭️  Skipping stored procedures (PG mode)`);
    return;
  }

  const scriptsPath = path.join(__dirname, 'dbScripts', moduleName);
  console.log(`   📂 STORED PROCEDURES`);

  for (const proc of extras.storedProcs) {
    const filePath = path.join(scriptsPath, proc.file);
    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  ${proc.title}: File ${proc.file} not found, skipping...`);
      continue;
    }

    console.log(`   📄 ${proc.title}: ${proc.file}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      const clean = statement.trim();
      if (clean && !clean.startsWith('--')) {
        try {
          const upper = clean.toUpperCase();
          const isProc = upper.startsWith('CREATE PROCEDURE') || upper.startsWith('CREATE FUNCTION') ||
            upper.startsWith('DROP PROCEDURE') || upper.startsWith('DROP FUNCTION') ||
            upper.includes('CREATE DEFINER');
          if (isProc) {
            await MultiDatabasePool.executeDDL(moduleName, clean);
          } else {
            await MultiDatabasePool.query(moduleName, clean);
          }
        } catch (error) {
          console.error(`   ❌ Failed in ${proc.file}:`, error);
          throw error;
        }
      }
    }
  }
}

/** Load demo/seed data from SQL files */
async function loadDemoData(moduleName: string) {
  const extras = moduleExtras[moduleName];
  if (!extras?.demoTables || extras.demoTables.length === 0) {
    console.log(`   ⚠️  No demo data configured for ${moduleName}, skipping...`);
    return;
  }

  const scriptsPath = path.join(__dirname, 'dbScripts', moduleName);
  const isPg = getDialect() === "postgres";
  console.log(`   🎭 DEMO DATA`);

  for (const table of extras.demoTables) {
    const filePath = path.join(scriptsPath, table.file);
    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  ${table.title}: File ${table.file} not found, skipping...`);
      continue;
    }

    console.log(`   📄 ${table.title}: ${table.file}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      let clean = statement.trim();
      if (clean && !clean.startsWith('--')) {
        try {
          if (isPg) clean = mysqlToPgSql(clean);
          await MultiDatabasePool.query(moduleName, clean);
        } catch (error) {
          console.error(`   ❌ Failed in ${table.file}:`, error);
          console.error(`   Statement: ${clean.substring(0, 100)}...`);
          throw error;
        }
      }
    }
  }
}

// ── Database/Schema management ──────────────────────────────────────────

async function ensureDatabaseExists(moduleName: string, dbConfig: any) {
  if (getDialect() === "postgres") {
    return ensurePgSchemaExists(moduleName, dbConfig);
  }
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port || 3306
  });

  try {
    console.log(`   🏗️  Ensuring database '${dbConfig.database}' exists...`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    console.log(`   ✅ Database '${dbConfig.database}' ready`);
  } finally {
    await connection.end();
  }
}

async function ensurePgSchemaExists(moduleName: string, dbConfig: any) {
  const client = postgres({
    host: dbConfig.host,
    port: dbConfig.port || 5432,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
  });

  try {
    console.log(`   🏗️  Ensuring schema '${moduleName}' exists in database '${dbConfig.database}'...`);
    await client.unsafe(`CREATE SCHEMA IF NOT EXISTS ${moduleName}`);
    await client.unsafe(`SET search_path TO ${moduleName}, public`);
    console.log(`   ✅ Schema '${moduleName}' ready`);
  } finally {
    await client.end();
  }
}

// ── Reset ───────────────────────────────────────────────────────────────

async function resetDatabases(options: InitOptions = {}) {
  console.log('⚠️  WARNING: This will drop and recreate all databases!');

  for (const moduleName of MODULES) {
    const dbConfig = Environment.getDatabaseConfig(moduleName);
    if (!dbConfig) {
      console.log(`⏭️  No configuration for ${moduleName}, skipping...`);
      continue;
    }

    console.log(`\n🗑️  Resetting ${moduleName} database...`);
    await resetModuleDatabase(moduleName, dbConfig);

    console.log(`🔧 Re-initializing ${moduleName} database...`);
    await initializeModuleDatabase(moduleName, options);
  }

  console.log('\n🔥 Database reset completed!');
}

async function resetModuleDatabase(moduleName: string, dbConfig: any) {
  if (getDialect() === "postgres") {
    return resetPgSchema(moduleName, dbConfig);
  }
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    port: dbConfig.port || 3306
  });

  try {
    console.log(`   🗑️  Dropping database '${dbConfig.database}'...`);
    await connection.execute(`DROP DATABASE IF EXISTS \`${dbConfig.database}\``);
    console.log(`   🏗️  Creating database '${dbConfig.database}'...`);
    await connection.execute(`CREATE DATABASE \`${dbConfig.database}\``);
    console.log(`   ✅ ${moduleName} database reset completed`);
  } finally {
    await connection.end();
  }
}

async function resetPgSchema(moduleName: string, dbConfig: any) {
  const client = postgres({
    host: dbConfig.host,
    port: dbConfig.port || 5432,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
  });

  try {
    console.log(`   🗑️  Dropping schema '${moduleName}'...`);
    await client.unsafe(`DROP SCHEMA IF EXISTS ${moduleName} CASCADE`);
    console.log(`   🏗️  Creating schema '${moduleName}'...`);
    await client.unsafe(`CREATE SCHEMA ${moduleName}`);
    console.log(`   ✅ ${moduleName} schema reset completed`);
  } finally {
    await client.end();
  }
}

// ── MySQL→PG translation (for demo data DML only) ──────────────────────

function mysqlToPgSql(sql: string): string {
  let result = sql;
  // Backtick-quoted identifiers → double-quoted
  result = result.replace(/`([^`]+)`/g, '"$1"');
  // ENGINE=InnoDB ... — strip (shouldn't appear in DML, but just in case)
  result = result.replace(/\)\s*ENGINE\s*=\s*[^;]+;/gi, ');');
  // MySQL binary literals b'0'/b'1' → false/true
  result = result.replace(/\bb'1'/g, 'true');
  result = result.replace(/\bb'0'/g, 'false');
  // IFNULL → COALESCE
  result = result.replace(/\bIFNULL\b/gi, 'COALESCE');
  // CURDATE() → CURRENT_DATE
  result = result.replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE');
  // UUID() → gen_random_uuid()
  result = result.replace(/\bUUID\(\)/gi, 'gen_random_uuid()');
  // COLLATE utf8mb4_... — strip
  result = result.replace(/\s+COLLATE\s+\w+/gi, '');
  // TRUNCATE TABLE → add CASCADE
  if (/^TRUNCATE\s+TABLE\s/i.test(result) && !result.includes('CASCADE')) {
    result = result.replace(/;?\s*$/, ' CASCADE;');
  }
  // SET FOREIGN_KEY_CHECKS — no-op in PG
  if (/^\s*SET\s+FOREIGN_KEY_CHECKS\b/i.test(result)) return '';
  return result;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  const lines = sql.split('\n');
  let current = '';
  let inProcedure = false;
  let procedureContent = '';

  for (const line of lines) {
    const trimmedLine = line.trim().toUpperCase();

    if (line.trim() === '' || line.trim().startsWith('--') || line.trim().startsWith('/*')) continue;

    if (trimmedLine.startsWith('CREATE PROCEDURE') || trimmedLine.startsWith('CREATE FUNCTION') ||
        trimmedLine.startsWith('CREATE DEFINER')) {
      inProcedure = true;
      procedureContent = line + '\n';
      continue;
    }

    if (trimmedLine.startsWith('DROP PROCEDURE') || trimmedLine.startsWith('DROP FUNCTION')) {
      statements.push(line);
      continue;
    }

    if (trimmedLine.startsWith('DELIMITER')) continue;

    if (inProcedure) {
      procedureContent += line + '\n';
      if (trimmedLine === 'END' || trimmedLine === 'END;' || trimmedLine === 'END$$' ||
          trimmedLine === 'END//' || /^END\s*(\/\/|\$\$)/.test(trimmedLine)) {
        let cleanProc = procedureContent.trim();
        cleanProc = cleanProc.replace(/\s*(\/\/|\$\$)\s*$/, '');
        statements.push(cleanProc);
        procedureContent = '';
        inProcedure = false;
      }
    } else {
      current += line + '\n';
      if (line.trim().endsWith(';')) {
        if (current.trim()) {
          statements.push(current.trim());
          current = '';
        }
      }
    }
  }

  if (current.trim()) statements.push(current.trim());
  if (procedureContent.trim()) statements.push(procedureContent.trim());

  return statements.filter(stmt => stmt.length > 0);
}

// ── CLI ─────────────────────────────────────────────────────────────────

function parseArguments(): InitOptions {
  const args = process.argv.slice(2);
  const options: InitOptions = {};

  for (const arg of args) {
    if (arg.startsWith('--module=')) options.module = arg.split('=')[1];
    else if (arg === '--reset') options.reset = true;
    else if (arg.startsWith('--environment=')) options.environment = arg.split('=')[1];
    else if (arg === '--demo-only') options.demoOnly = true;
    else if (arg === '--schema-only') options.schemaOnly = true;
  }

  if (options.module && !MODULES.includes(options.module as any)) {
    console.error(`❌ Invalid module: ${options.module}`);
    console.error(`   Valid modules: ${MODULES.join(', ')}`);
    process.exit(1);
  }

  return options;
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const options = parseArguments();
  initializeDatabases(options);
}
