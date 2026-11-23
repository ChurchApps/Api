import { type Kysely, sql } from "kysely";

// MySQL commits each DDL statement, so a run that added the column but never reached
// kysely_migration must not fail on "Duplicate column" when it is retried.
async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// Instructions for a step, shown at the top of each card in that step.
export async function up(db: Kysely<any>): Promise<void> {
  if (await columnExists(db, "workflowSteps", "instructions")) return;
  await sql`ALTER TABLE workflowSteps ADD COLUMN instructions TEXT NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE workflowSteps DROP COLUMN instructions`.execute(db);
}
