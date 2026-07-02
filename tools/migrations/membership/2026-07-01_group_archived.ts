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
  // `groups` is a reserved word since MySQL 8.0.2 (window-function GROUPS frame unit) — must be backtick-quoted.
  await sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`).execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "groups", "archived", "archived bit(1) DEFAULT b'0' AFTER removed");
  await sql`UPDATE \`groups\` SET archived = b'0' WHERE archived IS NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("groups").dropColumn("archived").execute();
}
