import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("pages").addColumn("publishedJSON", sql`longtext`).execute();
  await db.schema.alterTable("pages").addColumn("publishedAt", sql`datetime`).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("pages").dropColumn("publishedJSON").execute();
  await db.schema.alterTable("pages").dropColumn("publishedAt").execute();
}
