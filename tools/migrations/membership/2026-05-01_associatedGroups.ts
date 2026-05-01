import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("associatedGroups")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("settings", sql`varchar(1000)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_associatedGroups_churchId_contentType_contentId").on("associatedGroups").columns(["churchId", "contentType", "contentId"]).execute();
  await db.schema.createIndex("idx_associatedGroups_churchId_contentType_groupId").on("associatedGroups").columns(["churchId", "contentType", "groupId"]).execute();
  await db.schema.createIndex("idx_associatedGroups_churchId_groupId").on("associatedGroups").columns(["churchId", "groupId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("associatedGroups").ifExists().execute();
}
