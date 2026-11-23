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

// An optional category groups rooms and resources under headings in the booking pickers (#1650).
export async function up(db: Kysely<any>): Promise<void> {
  await addColumnIfMissing(db, "rooms", "categoryName", "categoryName VARCHAR(50) NULL");
  await addColumnIfMissing(db, "resources", "categoryName", "categoryName VARCHAR(50) NULL");
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE rooms DROP COLUMN categoryName`.execute(db);
  await sql`ALTER TABLE resources DROP COLUMN categoryName`.execute(db);
}
