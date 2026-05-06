import { type Kysely, sql } from "kysely";

// Mirrors tools/dbScripts/giving/migrations/phase3-subscription-currency.ts.
// Idempotent: skips the column if it already exists (initial schema declares
// it on fresh installs; pre-migrator prod databases do not).

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
  if (!(await columnExists(db, "subscriptions", "currency"))) {
    await sql.raw("ALTER TABLE subscriptions ADD COLUMN currency varchar(10) DEFAULT NULL AFTER customerId").execute(db);
  }

  // Backfill subscription currencies from each church's gateway. Idempotent via the WHERE clause.
  await sql`
    UPDATE subscriptions s
    LEFT JOIN gateways g ON g.churchId = s.churchId
    SET s.currency = COALESCE(g.currency, 'usd')
    WHERE s.currency IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("subscriptions").dropColumn("currency").execute();
}
