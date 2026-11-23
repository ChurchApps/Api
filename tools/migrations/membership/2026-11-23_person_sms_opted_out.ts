import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// A STOP reply used to set optedOut, which also hides the person from the directory. Texting now has its own flag.
// STOP replies were never recorded apart from directory opt-outs, so every opted-out person with a mobile number
// keeps texts off; nobody who is not texted today starts getting texts.
export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "people", "smsOptedOut")) return;
  await sql.raw("ALTER TABLE `people` ADD COLUMN smsOptedOut bit(1) NULL").execute(db);
  await sql.raw("UPDATE people SET smsOptedOut = 1 WHERE optedOut = 1 AND TRIM(COALESCE(mobilePhone, '')) <> ''").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE people DROP COLUMN smsOptedOut").execute(db);
}
