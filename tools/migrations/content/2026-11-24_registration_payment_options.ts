import { type Kysely, sql } from "kysely";

// MySQL commits each DDL statement, so a run that added a column but never reached
// kysely_migration must not fail on "Duplicate column" when it is retried.
async function columnExists(db: Kysely<any>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

// Per-event member self-cancel (on by default, today's behavior) and pay later (off by default),
// plus an optional per-attendee deposit on a registration type.
export async function up(db: Kysely<any>): Promise<void> {
  if (!(await columnExists(db, "events", "allowSelfCancel"))) {
    await sql`ALTER TABLE events ADD COLUMN allowSelfCancel bit(1) NOT NULL DEFAULT b'1'`.execute(db);
  }
  if (!(await columnExists(db, "events", "allowPayLater"))) {
    await sql`ALTER TABLE events ADD COLUMN allowPayLater bit(1) NOT NULL DEFAULT b'0'`.execute(db);
  }
  if (!(await columnExists(db, "registrationTypes", "depositAmount"))) {
    await sql`ALTER TABLE registrationTypes ADD COLUMN depositAmount decimal(10,2) NULL`.execute(db);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE registrationTypes DROP COLUMN depositAmount`.execute(db);
  await sql`ALTER TABLE events DROP COLUMN allowPayLater`.execute(db);
  await sql`ALTER TABLE events DROP COLUMN allowSelfCancel`.execute(db);
}
