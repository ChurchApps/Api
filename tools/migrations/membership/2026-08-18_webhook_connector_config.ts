import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE webhooks ADD COLUMN connectorConfig TEXT NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE webhooks DROP COLUMN connectorConfig`.execute(db);
}
