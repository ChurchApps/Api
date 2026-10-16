import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// contentType/contentId were added to devices outside the migration history; add them where missing.
const COLUMNS: Array<[string, string]> = [
  ["contentType", "varchar(45) NULL"],
  ["contentId", "varchar(45) NULL"],
  ["secret", "varchar(64) NULL"],
  ["status", "json NULL"]
];

export async function up(db: Kysely<any>): Promise<void> {
  for (const [column, definition] of COLUMNS) {
    if (await columnExists(db, "devices", column)) continue;
    await sql.raw(`ALTER TABLE \`devices\` ADD COLUMN \`${column}\` ${definition}`).execute(db);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("devices").dropColumn("status").execute();
  await db.schema.alterTable("devices").dropColumn("secret").execute();
}
