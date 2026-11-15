import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

async function addColumnIfMissing(db: Kysely<any>, table: string, column: string, definition: string) {
  if (await columnExists(db, table, column)) return;
  await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${definition}`).execute(db);
}

// The donor-facing memo, printed on giving statements and receipts. notes stays internal to staff.
// Existing notes are not copied: they mix donor memos with staff remarks, so nothing old is printed.
export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "donations", "memo", "memo text DEFAULT NULL AFTER notes");
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("donations").dropColumn("memo").execute();
}
