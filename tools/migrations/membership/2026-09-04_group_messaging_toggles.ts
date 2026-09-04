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
  // `groups` is a reserved word since MySQL 8.0.2 — must be backtick-quoted.
  await sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`).execute(db);
}

// Per-group on/off toggles for the two chat feeds (ChurchAppsSupport#1054). Both default on so
// existing groups keep today's behavior. bit(1) like publicRoster/confidential so the pool's
// typeCast hands the messaging gate a real boolean.
export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "groups", "discussionsEnabled", "discussionsEnabled bit(1) NOT NULL DEFAULT b'1' AFTER joinPolicy");
  await addColumnIfMissing(db, "groups", "announcementsEnabled", "announcementsEnabled bit(1) NOT NULL DEFAULT b'1' AFTER discussionsEnabled");
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("groups").dropColumn("announcementsEnabled").execute();
  await db.schema.alterTable("groups").dropColumn("discussionsEnabled").execute();
}
