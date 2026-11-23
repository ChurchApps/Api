import { type Kysely, sql } from "kysely";

// MySQL commits each DDL statement, so a run that added the column but never reached
// kysely_migration must not fail on "Duplicate column" when it is retried.
async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// Optional plain-text description shown to donors under the fund name on the giving form.
export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "funds", "description")) return;
  await sql`ALTER TABLE funds ADD COLUMN description VARCHAR(500) NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE funds DROP COLUMN description`.execute(db);
}
