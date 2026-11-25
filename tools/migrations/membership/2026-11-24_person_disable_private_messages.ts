import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// Admin-set per-person switch that blocks new private conversations in both directions
// (ChurchAppsSupport#1680). NULL/0 = off for everyone until an admin checks it. bit(1) like
// optedOut/smsOptedOut so the pool's typeCast hands the messaging gate a real boolean.
export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "people", "disablePrivateMessages")) return;
  await sql.raw("ALTER TABLE `people` ADD COLUMN disablePrivateMessages bit(1) NULL").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE people DROP COLUMN disablePrivateMessages").execute(db);
}
