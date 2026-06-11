import { type Kysely, sql } from "kysely";

// 1.15/2.1: lists store a rules tree (cross-product conditions) plus sharing scope,
// nightly auto-refresh, household inclusion and attached actions. listMembers caches
// refresh results so membership diffs (join/leave) can drive notifications/automations.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("lists")
    .addColumn("rules", sql`mediumtext`)
    .addColumn("scope", sql`varchar(20)`, (col) => col.defaultTo("org"))
    .addColumn("roleId", sql`char(11)`)
    .addColumn("autoRefresh", sql`tinyint(1)`, (col) => col.notNull().defaultTo(0))
    .addColumn("householdInclusion", sql`varchar(20)`, (col) => col.defaultTo("none"))
    .addColumn("notifyOnChange", sql`tinyint(1)`, (col) => col.notNull().defaultTo(0))
    .addColumn("actions", sql`mediumtext`)
    .execute();

  await db.schema
    .createTable("listMembers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("listId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`, (col) => col.notNull())
    .addColumn("dateAdded", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_listMembers_church_list").on("listMembers").columns(["churchId", "listId"]).execute();
  await db.schema.createIndex("ux_listMembers_list_person").on("listMembers").columns(["listId", "personId"]).unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("listMembers").ifExists().execute();
  await db.schema.alterTable("lists")
    .dropColumn("rules")
    .dropColumn("scope")
    .dropColumn("roleId")
    .dropColumn("autoRefresh")
    .dropColumn("householdInclusion")
    .dropColumn("notifyOnChange")
    .dropColumn("actions")
    .execute();
}
