import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("playlists")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("items", sql`json`)
    .addColumn("updatedAt", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_playlists_churchId").on("playlists").columns(["churchId"]).execute();

  await db.schema
    .createTable("screenGroups")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("defaultPlaylistId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_screenGroups_churchId").on("screenGroups").columns(["churchId"]).execute();

  await db.schema
    .createTable("scheduleEntries")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("screenGroupId", sql`char(11)`)
    .addColumn("targetType", sql`varchar(20)`)
    .addColumn("targetId", sql`char(11)`)
    .addColumn("providerId", sql`varchar(50)`)
    .addColumn("providerPath", sql`varchar(500)`)
    .addColumn("start", sql`datetime`)
    .addColumn("end", sql`datetime`)
    .addColumn("recurrenceRule", sql`varchar(255)`)
    .addColumn("exceptionDates", sql`json`)
    .addColumn("endBehavior", sql`varchar(20)`)
    .addColumn("enabled", sql`tinyint(1)`, (col) => col.notNull().defaultTo(1))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_scheduleEntries_churchId_screenGroupId").on("scheduleEntries").columns(["churchId", "screenGroupId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scheduleEntries").ifExists().execute();
  await db.schema.dropTable("screenGroups").ifExists().execute();
  await db.schema.dropTable("playlists").ifExists().execute();
}
