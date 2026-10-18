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
  await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${definition}`).execute(db);
}

// A batch is open (null or 'open') until someone with Edit Donations closes it; existing batches stay open.
export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "donationBatches", "status", "status varchar(10) DEFAULT 'open' AFTER batchDate");
  await addColumnIfMissing(db, "donationBatches", "closedDate", "closedDate datetime DEFAULT NULL AFTER status");
  await addColumnIfMissing(db, "donationBatches", "closedBy", "closedBy char(11) DEFAULT NULL AFTER closedDate");
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("donationBatches").dropColumn("closedBy").dropColumn("closedDate").dropColumn("status").execute();
}
