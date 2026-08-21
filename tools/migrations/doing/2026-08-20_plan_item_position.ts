import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE planItems ADD COLUMN positionId CHAR(11) NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE planItems DROP COLUMN positionId`.execute(db);
}
