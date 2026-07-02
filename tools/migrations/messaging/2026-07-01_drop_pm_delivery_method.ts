import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE privateMessages DROP COLUMN deliveryMethod").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE privateMessages ADD COLUMN deliveryMethod varchar(10)").execute(db);
}
