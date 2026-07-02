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
  await addColumnIfMissing(db, "groups", "publicRoster", "publicRoster bit(1) DEFAULT b'0' AFTER archived");
  await sql`UPDATE \`groups\` SET publicRoster = b'0' WHERE publicRoster IS NULL`.execute(db);

  await addColumnIfMissing(db, "forms", "displayMode", "displayMode varchar(20) NOT NULL DEFAULT 'standard'");
  await addColumnIfMissing(db, "forms", "autoCreatePerson", "autoCreatePerson bit(1) DEFAULT b'0'");
  await addColumnIfMissing(db, "forms", "followUpSubject", "followUpSubject varchar(255)");
  await addColumnIfMissing(db, "forms", "followUpBody", "followUpBody text");
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("forms").dropColumn("followUpBody").execute();
  await db.schema.alterTable("forms").dropColumn("followUpSubject").execute();
  await db.schema.alterTable("forms").dropColumn("autoCreatePerson").execute();
  await db.schema.alterTable("forms").dropColumn("displayMode").execute();
  await db.schema.alterTable("groups").dropColumn("publicRoster").execute();
}
