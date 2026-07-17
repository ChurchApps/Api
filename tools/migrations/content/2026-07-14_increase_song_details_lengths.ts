import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE songDetails MODIFY COLUMN title VARCHAR(255), MODIFY COLUMN artist VARCHAR(255), MODIFY COLUMN album VARCHAR(255)`.execute(db);
  await sql`ALTER TABLE songs MODIFY COLUMN name VARCHAR(255)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE songDetails MODIFY COLUMN title VARCHAR(45), MODIFY COLUMN artist VARCHAR(45), MODIFY COLUMN album VARCHAR(45)`.execute(db);
  await sql`ALTER TABLE songs MODIFY COLUMN name VARCHAR(45)`.execute(db);
}
