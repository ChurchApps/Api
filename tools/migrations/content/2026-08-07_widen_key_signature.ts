import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE songDetails MODIFY COLUMN keySignature VARCHAR(20)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE songDetails MODIFY COLUMN keySignature VARCHAR(5)`.execute(db);
}
