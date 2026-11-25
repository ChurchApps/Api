import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// A question can be shown only when an earlier question is answered, or answered with one choice: {"questionId","value"}.
export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "questions", "showIf")) return;
  await sql.raw("ALTER TABLE questions ADD COLUMN showIf varchar(500) NULL").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE questions DROP COLUMN showIf").execute(db);
}
