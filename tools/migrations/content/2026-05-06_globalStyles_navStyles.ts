import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("globalStyles")
    .addColumn("navStyles", sql`text`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("globalStyles")
    .dropColumn("navStyles")
    .execute();
}
