import { type Kysely, sql } from "kysely";

async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// Leader's recap/plan for a group meeting, shown to every group member.
export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "sessions", "notes")) return;
  await sql.raw("ALTER TABLE `sessions` ADD COLUMN notes text NULL").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("sessions").dropColumn("notes").execute();
}
