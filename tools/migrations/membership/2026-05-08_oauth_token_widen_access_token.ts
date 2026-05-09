import { type Kysely, sql } from "kysely";

// Widen oAuthTokens.accessToken from VARCHAR(1000) to TEXT.
//
// Background: getCombinedApiJwt() emits a JWT containing every permission +
// every group id for the user, so for users with many roles the encoded JWT
// regularly exceeds 1000 chars. The demo user demo@b1.church (Domain Admin)
// produces a ~1359-char JWT; the device-flow grant in OAuthController inserts
// it into oAuthTokens.accessToken and any value beyond 1000 chars causes the
// INSERT to fail and the /oauth/token call to return 500.
//
// TEXT (up to 64KB) gives generous headroom without committing to a fixed cap.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN accessToken TEXT`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN accessToken VARCHAR(1000)`.execute(db);
}
