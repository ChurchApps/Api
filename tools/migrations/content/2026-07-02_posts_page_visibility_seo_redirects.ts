import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. posts
  await db.schema
    .createTable("posts")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("pageId", sql`char(11)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("slug", sql`varchar(255)`)
    .addColumn("excerpt", sql`text`)
    .addColumn("authorId", sql`char(11)`)
    .addColumn("photoUrl", sql`varchar(1024)`)
    .addColumn("publishDate", sql`datetime`)
    .addColumn("category", sql`varchar(45)`)
    .addColumn("tags", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_posts_churchId_slug").on("posts").columns(["churchId", "slug"]).unique().execute();
  await db.schema.createIndex("idx_posts_churchId_publishDate").on("posts").columns(["churchId", "publishDate"]).execute();

  // 2. pages: visibility + SEO
  await db.schema.alterTable("pages").addColumn("visibility", sql`varchar(45)`, (col) => col.defaultTo("everyone")).execute();
  await db.schema.alterTable("pages").addColumn("groupIds", sql`text`).execute();
  await sql`UPDATE pages SET visibility = 'everyone' WHERE visibility IS NULL`.execute(db);
  await db.schema.alterTable("pages").addColumn("metaDescription", sql`varchar(300)`).execute();

  // 3. redirects
  await db.schema
    .createTable("redirects")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("fromPath", sql`varchar(500)`)
    .addColumn("toPath", sql`varchar(500)`)
    .addColumn("createdDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_redirects_churchId_fromPath").on("redirects").columns(["churchId", "fromPath"]).unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("redirects").ifExists().execute();
  await db.schema.alterTable("pages").dropColumn("metaDescription").execute();
  await db.schema.alterTable("pages").dropColumn("groupIds").execute();
  await db.schema.alterTable("pages").dropColumn("visibility").execute();
  await db.schema.dropTable("posts").ifExists().execute();
}
