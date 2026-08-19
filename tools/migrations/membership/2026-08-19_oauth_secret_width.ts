import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN refreshToken VARCHAR(64)`.execute(db);
  await sql`ALTER TABLE oAuthCodes MODIFY COLUMN code VARCHAR(64)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN refreshToken VARCHAR(45)`.execute(db);
  await sql`ALTER TABLE oAuthCodes MODIFY COLUMN code VARCHAR(45)`.execute(db);
}
