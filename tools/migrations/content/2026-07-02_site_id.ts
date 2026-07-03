import { type Kysely, sql } from "kysely";

// Adds siteId to the site-scoped content tables. '' = primary site (shared),
// so every existing row keeps today's behavior. Multiple websites per church
// then live as distinct non-empty siteIds.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("pages").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();
  await db.schema.alterTable("links").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();
  await db.schema.alterTable("globalStyles").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();
  await db.schema.alterTable("blocks").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();

  // Create-before-drop is deliberate: old uniqueness implies the new one, so a crash
  // between the two leaves both indexes present — harmless. MySQL has no
  // DROP INDEX IF EXISTS (Kysely's ifExists() emits MariaDB-only syntax), hence raw SQL.
  await db.schema.createIndex("idx_pages_churchId_siteId_url").on("pages").columns(["churchId", "siteId", "url"]).unique().execute();
  await sql`ALTER TABLE pages DROP INDEX idx_pages_churchId_url`.execute(db);

  await db.schema.createIndex("idx_links_churchId_siteId").on("links").columns(["churchId", "siteId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Not reversible once secondary-site pages exist: recreating unique (churchId, url)
  // throws if any site page shares a url with a primary page. Delete site rows first.
  await db.schema.createIndex("idx_pages_churchId_url").on("pages").columns(["churchId", "url"]).unique().execute();
  await sql`ALTER TABLE links DROP INDEX idx_links_churchId_siteId`.execute(db);
  await sql`ALTER TABLE pages DROP INDEX idx_pages_churchId_siteId_url`.execute(db);

  await db.schema.alterTable("blocks").dropColumn("siteId").execute();
  await db.schema.alterTable("globalStyles").dropColumn("siteId").execute();
  await db.schema.alterTable("links").dropColumn("siteId").execute();
  await db.schema.alterTable("pages").dropColumn("siteId").execute();
}
