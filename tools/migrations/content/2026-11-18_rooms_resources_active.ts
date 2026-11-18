import { type Kysely, sql } from "kysely";

// MySQL commits each DDL statement, so a run that added the columns but never reached
// kysely_migration must not fail on "Duplicate column" when it is retried.
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

// Inactive rooms and resources stay on file but drop out of the booking pickers (#1593).
export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "rooms", "active", "active TINYINT(1) NOT NULL DEFAULT 1");
  await addColumnIfMissing(db, "resources", "active", "active TINYINT(1) NOT NULL DEFAULT 1");
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE rooms DROP COLUMN active`.execute(db);
  await sql`ALTER TABLE resources DROP COLUMN active`.execute(db);
}
