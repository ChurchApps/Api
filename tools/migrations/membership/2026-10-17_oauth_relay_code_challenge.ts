import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "oAuthRelaySessions", "codeChallenge")) return;
  await sql.raw("ALTER TABLE `oAuthRelaySessions` ADD COLUMN codeChallenge varchar(128) NULL AFTER redirectUri").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("oAuthRelaySessions").dropColumn("codeChallenge").execute();
}
