import { type Kysely, sql } from "kysely";

// JWT for users with many roles/groups regularly exceeds VARCHAR(1000), causing /oauth/token 500s.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN accessToken TEXT`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN accessToken VARCHAR(1000)`.execute(db);
}
