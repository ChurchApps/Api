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

export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "funds", "visible", "visible bit(1) DEFAULT b'1' AFTER taxDeductible");

  // MySQL's instant ADD COLUMN should surface the DEFAULT for pre-existing rows, but
  // backfill explicitly so funds created before this migration are never hidden.
  await sql`UPDATE funds SET visible = b'1' WHERE visible IS NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("funds").dropColumn("visible").execute();
}
