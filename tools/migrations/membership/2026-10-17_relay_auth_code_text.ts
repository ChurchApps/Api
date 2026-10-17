import { type Kysely, sql } from "kysely";

// Microsoft authorization codes exceed 512 chars; varchar(512) silently truncated them and the exchange failed.
export async function up(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE oAuthRelaySessions MODIFY COLUMN authCode text NULL").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE oAuthRelaySessions MODIFY COLUMN authCode varchar(512) NULL").execute(db);
}
