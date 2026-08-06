import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("storageProviders")
    .addColumn("accessToken", sql`text`)
    .addColumn("refreshToken", sql`text`)
    .addColumn("tokenExpiresAt", sql`datetime`)
    .addColumn("settings", sql`varchar(1024)`)
    .execute();

  await db.schema.alterTable("files")
    .addColumn("provider", sql`varchar(45)`)
    .addColumn("externalId", sql`varchar(255)`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("storageProviders")
    .dropColumn("accessToken")
    .dropColumn("refreshToken")
    .dropColumn("tokenExpiresAt")
    .dropColumn("settings")
    .execute();

  await db.schema.alterTable("files")
    .dropColumn("provider")
    .dropColumn("externalId")
    .execute();
}
