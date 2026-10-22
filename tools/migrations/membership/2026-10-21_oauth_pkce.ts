import { type Kysely, sql } from "kysely";

// MCP connectors (claude.ai, ChatGPT) self-register as public clients and sign in with PKCE.
// Scope lists for those clients outgrow the old 45/255 char columns.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthCodes ADD COLUMN codeChallenge VARCHAR(128) NULL, ADD COLUMN codeChallengeMethod VARCHAR(10) NULL, MODIFY COLUMN scopes VARCHAR(1000)`.execute(db);
  await sql`ALTER TABLE oAuthClients ADD COLUMN selfRegistered TINYINT(1) NOT NULL DEFAULT 0, MODIFY COLUMN redirectUris TEXT`.execute(db);
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN scopes VARCHAR(1000)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN scopes VARCHAR(45)`.execute(db);
  await sql`ALTER TABLE oAuthClients DROP COLUMN selfRegistered, MODIFY COLUMN redirectUris VARCHAR(255)`.execute(db);
  await sql`ALTER TABLE oAuthCodes DROP COLUMN codeChallenge, DROP COLUMN codeChallengeMethod, MODIFY COLUMN scopes VARCHAR(255)`.execute(db);
}
