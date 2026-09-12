import { type Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createIndex("idx_bibleLookups_time_key_ip").on("bibleLookups").columns(["lookupTime", "translationKey", "ipAddress"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_bibleLookups_time_key_ip").on("bibleLookups").execute();
}
