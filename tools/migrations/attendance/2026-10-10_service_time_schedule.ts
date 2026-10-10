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

// Optional schedule for a service time. dayOfWeek is 0 (Sunday) - 6; times are church-local.
// When dayOfWeek/startTime are NULL check-in is not time-gated (the pre-existing behaviour).
export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "serviceTimes", "dayOfWeek", "dayOfWeek tinyint NULL");
  await addColumnIfMissing(db, "serviceTimes", "startTime", "startTime time NULL");
  await addColumnIfMissing(db, "serviceTimes", "endTime", "endTime time NULL");
  await addColumnIfMissing(db, "serviceTimes", "checkinOpenMinutes", "checkinOpenMinutes int NULL");
  await addColumnIfMissing(db, "serviceTimes", "checkinCloseMinutes", "checkinCloseMinutes int NULL");
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("serviceTimes").dropColumn("checkinCloseMinutes").execute();
  await db.schema.alterTable("serviceTimes").dropColumn("checkinOpenMinutes").execute();
  await db.schema.alterTable("serviceTimes").dropColumn("endTime").execute();
  await db.schema.alterTable("serviceTimes").dropColumn("startTime").execute();
  await db.schema.alterTable("serviceTimes").dropColumn("dayOfWeek").execute();
}
