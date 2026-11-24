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

// Optional one-line reason a volunteer gives when declining a serving request.
export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "assignments", "declineReason")) return;
  await sql`ALTER TABLE assignments ADD COLUMN declineReason VARCHAR(255) NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE assignments DROP COLUMN declineReason`.execute(db);
}
