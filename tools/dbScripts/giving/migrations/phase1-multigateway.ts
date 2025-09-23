import { Environment } from "../../../../src/shared/helpers/Environment";
import { MultiDatabasePool } from "../../../../src/shared/infrastructure/MultiDatabasePool";

interface MigrationOptions {
  dryRun: boolean;
  environment: string;
}

async function getDatabaseName(): Promise<string> {
  const config = Environment.getDatabaseConfig("giving");
  if (!config || !config.database) {
    throw new Error("Giving database configuration is missing. Ensure ENV variables or config files are set.");
  }
  return config.database;
}

async function columnExists(database: string, table: string, column: string): Promise<boolean> {
  const sql =
    "SELECT COUNT(*) as count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?";
  const rows: any[] = await MultiDatabasePool.query("giving", sql, [database, table, column]);
  return rows.length > 0 && rows[0].count > 0;
}

async function addColumnIfMissing(options: MigrationOptions, table: string, column: string, definition: string) {
  const database = await getDatabaseName();
  const exists = await columnExists(database, table, column);
  if (exists) {
    console.log(`ℹ️  ${table}.${column} already exists. Skipping.`);
    return;
  }

  const sql = `ALTER TABLE ${table} ADD COLUMN ${definition}`;
  if (options.dryRun) {
    console.log(`📝 [dry-run] Would execute: ${sql}`);
    return;
  }
  console.log(`⚙️  Executing: ${sql}`);
  await MultiDatabasePool.query("giving", sql);
}

async function tableExists(database: string, table: string): Promise<boolean> {
  const sql = "SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?";
  const rows: any[] = await MultiDatabasePool.query("giving", sql, [database, table]);
  return rows.length > 0 && rows[0].count > 0;
}

async function createGatewayPaymentMethodsTable(options: MigrationOptions) {
  const database = await getDatabaseName();
  const exists = await tableExists(database, "gatewayPaymentMethods");
  if (exists) {
    console.log("ℹ️  gatewayPaymentMethods table already exists. Skipping creation.");
    return;
  }

  const sql = `
    CREATE TABLE gatewayPaymentMethods (
      id char(11) NOT NULL,
      churchId char(11) NOT NULL,
      gatewayId char(11) NOT NULL,
      customerId varchar(255) NOT NULL,
      externalId varchar(255) NOT NULL,
      methodType varchar(50) DEFAULT NULL,
      displayName varchar(255) DEFAULT NULL,
      metadata json DEFAULT NULL,
      createdAt datetime DEFAULT CURRENT_TIMESTAMP,
      updatedAt datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY ux_gateway_payment_methods_external (gatewayId, externalId),
      INDEX idx_gateway_payment_methods_church (churchId),
      INDEX idx_gateway_payment_methods_customer (customerId)
    ) ENGINE=InnoDB;
  `;

  if (options.dryRun) {
    console.log("📝 [dry-run] Would create gatewayPaymentMethods table.");
    return;
  }
  console.log("⚙️  Creating gatewayPaymentMethods table...");
  await MultiDatabasePool.executeDDL("giving", sql);
}

async function backfillCustomerProviders(options: MigrationOptions) {
  const sql = `
    UPDATE customers c
    LEFT JOIN gateways g ON g.churchId = c.churchId
    SET c.provider = COALESCE(g.provider, 'stripe')
    WHERE c.provider IS NULL OR c.provider = ''
  `;

  if (options.dryRun) {
    console.log("📝 [dry-run] Would backfill customer providers from gateways.");
    return;
  }

  console.log("⚙️  Backfilling customer providers using current gateway provider...");
  const result: any = await MultiDatabasePool.query("giving", sql);
  console.log(`   ✅ Updated rows: ${result.affectedRows ?? 0}`);
}

async function validateGatewayUniqueness() {
  const sql = "SELECT churchId, COUNT(*) as gatewayCount FROM gateways GROUP BY churchId HAVING COUNT(*) > 1";
  const rows: any[] = await MultiDatabasePool.query("giving", sql);
  if (rows.length === 0) {
    console.log("✅ Validation passed: all churches have at most one gateway row.");
    return;
  }

  console.log("❌ Validation failed: Multiple gateways found for some churches.");
  rows.forEach((row) => {
    console.log(`   - churchId ${row.churchId} has ${row.gatewayCount} gateways`);
  });
  throw new Error("Gateway uniqueness validation failed. Resolve duplicates before rerunning migration.");
}

async function runMigration(options: MigrationOptions) {
  await Environment.init(options.environment);
  console.log(`🚀 Running Multi-Gateway Phase 1 migration (dryRun=${options.dryRun})`);

  await addColumnIfMissing(options, "gateways", "settings", "settings json DEFAULT NULL AFTER payFees");
  await addColumnIfMissing(options, "gateways", "environment", "environment varchar(50) DEFAULT NULL AFTER settings");
  await addColumnIfMissing(options, "gateways", "createdAt", "createdAt datetime DEFAULT CURRENT_TIMESTAMP AFTER environment");
  await addColumnIfMissing(
    options,
    "gateways",
    "updatedAt",
    "updatedAt datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER createdAt"
  );

  await addColumnIfMissing(options, "customers", "provider", "provider varchar(50) DEFAULT NULL AFTER personId");
  await addColumnIfMissing(options, "customers", "metadata", "metadata json DEFAULT NULL AFTER provider");

  await createGatewayPaymentMethodsTable(options);

  await backfillCustomerProviders(options);
  await validateGatewayUniqueness();

  console.log("🎉 Phase 1 migration complete!");
}

function parseOptions(): MigrationOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const envArg = args.find((arg) => arg.startsWith("--env="));
  const environment = envArg ? envArg.split("=")[1] : process.env.ENVIRONMENT || "dev";
  return { dryRun, environment };
}

(async () => {
  const options = parseOptions();
  try {
    await runMigration(options);
  } catch (error) {
    console.error("❌ Migration failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await MultiDatabasePool.closeAll();
  }
})();
