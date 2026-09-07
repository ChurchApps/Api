import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE sermons ADD COLUMN audioUrl VARCHAR(255) NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE sermons DROP COLUMN audioUrl`.execute(db);
}
