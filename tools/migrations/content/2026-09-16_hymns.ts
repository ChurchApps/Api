import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("hymns")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("number", sql`int`, (col) => col.notNull())
    .addColumn("title", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("language", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("versesJSON", sql`mediumtext`, (col) => col.notNull())
    .addColumn("chorus", sql`text`)
    .addColumn("author", sql`varchar(255)`)
    .addColumn("composer", sql`varchar(255)`)
    .addColumn("translator", sql`varchar(255)`)
    .addColumn("tune", sql`varchar(255)`)
    .addColumn("category", sql`varchar(100)`)
    .addColumn("source", sql`varchar(500)`)
    .addColumn("copyright", sql`varchar(500)`)
    .addColumn("license", sql`varchar(255)`)
    .addColumn("attribution", sql`varchar(1000)`)
    .addColumn("published", sql`bit(1)`, (col) => col.notNull().defaultTo(0))
    .addColumn("archived", sql`bit(1)`, (col) => col.notNull().defaultTo(0))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_hymns_churchId_number").on("hymns").columns(["churchId", "number"]).execute();
  await db.schema.createIndex("idx_hymns_churchId_title").on("hymns").columns(["churchId", "title"]).execute();
  await db.schema.createIndex("idx_hymns_churchId_published_archived").on("hymns").columns(["churchId", "published", "archived"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("hymns").ifExists().execute();
}