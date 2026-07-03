import { type Kysely, sql } from "kysely";


export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE webhooks ADD COLUMN connectorType VARCHAR(20) NOT NULL DEFAULT 'standard'`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE webhooks DROP COLUMN connectorType`.execute(db);
}
