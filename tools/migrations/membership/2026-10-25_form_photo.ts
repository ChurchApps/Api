import { type Kysely, sql } from "kysely";

// Optional header photo shown above a form's description (issue #1360).
export async function up(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE forms ADD COLUMN photoUrl varchar(255) NULL").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE forms DROP COLUMN photoUrl").execute(db);
}
