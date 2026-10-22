import { type Kysely, sql } from "kysely";

// A rotated refresh token is kept for a grace window and points at the token that replaced it (#1024).
async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "oAuthTokens", "replacedById")) return;
  await sql.raw("ALTER TABLE `oAuthTokens` ADD COLUMN replacedById char(11) AFTER planTypeId").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("oAuthTokens").dropColumn("replacedById").execute();
}
