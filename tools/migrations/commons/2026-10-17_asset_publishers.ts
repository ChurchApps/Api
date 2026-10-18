import { type Kysely, sql } from "kysely";

// Co-writers who publish a song alongside its uploader. assets.publisherUserId stays the primary publisher (the
// uploader, filled by commons-up and the catalog seed); these rows are the extra accounts a server admin links
// from B1 Admin. Every publisher gets the song in My songs, may edit it and counts it in their writer stats.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable("assetPublishers")
    .addColumn("assetId", sql`char(11)`, (c) => c.notNull())
    .addColumn("userId", sql`char(11)`, (c) => c.notNull())
    .addColumn("addedBy", sql`char(11)`)
    .addColumn("createdAt", "datetime", (c) => c.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint("pk_assetPublishers", ["assetId", "userId"])
    .execute();
  await db.schema.createIndex("idx_assetPublishers_user").on("assetPublishers").column("userId").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("assetPublishers").execute();
}
