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
  await sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`).execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  // NULL checkinType = legacy/member. Values: "member" | "guest" | "volunteer".
  await addColumnIfMissing(db, "visits", "checkinType", "checkinType varchar(20) NULL");
  await addColumnIfMissing(db, "visits", "checkedInById", "checkedInById char(11) NULL");
  await db.schema.createIndex("idx_visits_church_date_type").on("visits").columns(["churchId", "visitDate", "checkinType"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_visits_church_date_type").on("visits").execute();
  await db.schema.alterTable("visits").dropColumn("checkedInById").execute();
  await db.schema.alterTable("visits").dropColumn("checkinType").execute();
}
