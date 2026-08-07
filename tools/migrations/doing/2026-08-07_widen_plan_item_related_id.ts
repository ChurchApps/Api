import { type Kysely, sql } from "kysely";

// External curriculum provider ids exceed the internal 11-char id length.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE planItems MODIFY COLUMN relatedId VARCHAR(255)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE planItems MODIFY COLUMN relatedId CHAR(11)`.execute(db);
}
