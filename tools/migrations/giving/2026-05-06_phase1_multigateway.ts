import { type Kysely, sql } from "kysely";

// Mirrors tools/dbScripts/giving/migrations/phase1-multigateway.ts.
// Idempotent: skips columns/tables that already exist (the initial schema
// declares them on fresh installs; pre-migrator prod databases do not).

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

async function tableExists(db: Kysely<any>, table: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

async function addColumnIfMissing(db: Kysely<any>, table: string, column: string, definition: string) {
  if (await columnExists(db, table, column)) return;
  await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${definition}`).execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "gateways", "settings", "settings json DEFAULT NULL AFTER payFees");
  await addColumnIfMissing(db, "gateways", "environment", "environment varchar(50) DEFAULT NULL AFTER settings");
  await addColumnIfMissing(db, "gateways", "createdAt", "createdAt datetime DEFAULT CURRENT_TIMESTAMP AFTER environment");
  await addColumnIfMissing(db, "gateways", "updatedAt", "updatedAt datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER createdAt");

  await addColumnIfMissing(db, "customers", "provider", "provider varchar(50) DEFAULT NULL AFTER personId");
  await addColumnIfMissing(db, "customers", "metadata", "metadata json DEFAULT NULL AFTER provider");

  if (!(await tableExists(db, "gatewayPaymentMethods"))) {
    await db.schema
      .createTable("gatewayPaymentMethods")
      .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
      .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
      .addColumn("gatewayId", sql`char(11)`, (col) => col.notNull())
      .addColumn("customerId", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("externalId", sql`varchar(255)`, (col) => col.notNull())
      .addColumn("methodType", sql`varchar(50)`)
      .addColumn("displayName", sql`varchar(255)`)
      .addColumn("metadata", sql`json`)
      .addColumn("createdAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn("updatedAt", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`))
      .modifyEnd(sql`ENGINE=InnoDB`)
      .execute();

    await db.schema.createIndex("ux_gateway_payment_methods_external").on("gatewayPaymentMethods").columns(["gatewayId", "externalId"]).unique().execute();
    await db.schema.createIndex("idx_gateway_payment_methods_church").on("gatewayPaymentMethods").column("churchId").execute();
    await db.schema.createIndex("idx_gateway_payment_methods_customer").on("gatewayPaymentMethods").column("customerId").execute();
  }

  // Backfill customers.provider from each church's gateway. Idempotent via the WHERE clause.
  await sql`
    UPDATE customers c
    LEFT JOIN gateways g ON g.churchId = c.churchId
    SET c.provider = COALESCE(g.provider, 'stripe')
    WHERE c.provider IS NULL OR c.provider = ''
  `.execute(db);

  // Validate: phase1 assumes one gateway row per church.
  const dupes = await sql<{ churchId: string; gatewayCount: number }>`
    SELECT churchId, COUNT(*) AS gatewayCount FROM gateways GROUP BY churchId HAVING COUNT(*) > 1
  `.execute(db);
  if (dupes.rows.length > 0) {
    const detail = dupes.rows.map((r) => `${(r as any).churchId}=${(r as any).gatewayCount}`).join(", ");
    throw new Error(`Gateway uniqueness validation failed (churchId=count): ${detail}. Resolve duplicates before re-running.`);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("gatewayPaymentMethods").ifExists().execute();
  await db.schema.alterTable("customers").dropColumn("metadata").dropColumn("provider").execute();
  await db.schema
    .alterTable("gateways")
    .dropColumn("updatedAt")
    .dropColumn("createdAt")
    .dropColumn("environment")
    .dropColumn("settings")
    .execute();
}
