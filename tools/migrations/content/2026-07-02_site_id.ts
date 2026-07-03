import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("pages").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();
  await db.schema.alterTable("links").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();
  await db.schema.alterTable("globalStyles").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();
  await db.schema.alterTable("blocks").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();

  await db.schema.createIndex("idx_pages_churchId_siteId_url").on("pages").columns(["churchId", "siteId", "url"]).unique().execute();
  await sql`ALTER TABLE pages DROP INDEX idx_pages_churchId_url`.execute(db);

  await db.schema.createIndex("idx_links_churchId_siteId").on("links").columns(["churchId", "siteId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.createIndex("idx_pages_churchId_url").on("pages").columns(["churchId", "url"]).unique().execute();
  await sql`ALTER TABLE links DROP INDEX idx_links_churchId_siteId`.execute(db);
  await sql`ALTER TABLE pages DROP INDEX idx_pages_churchId_siteId_url`.execute(db);

  await db.schema.alterTable("blocks").dropColumn("siteId").execute();
  await db.schema.alterTable("globalStyles").dropColumn("siteId").execute();
  await db.schema.alterTable("links").dropColumn("siteId").execute();
  await db.schema.alterTable("pages").dropColumn("siteId").execute();
}
