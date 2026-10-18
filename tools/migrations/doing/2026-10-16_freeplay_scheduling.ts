import { type Kysely, sql } from "kysely";

// MySQL commits each DDL statement, so a failed run leaves these indexes behind and is not recorded.
async function indexExists(db: Kysely<any>, table: string, index: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND INDEX_NAME = ${index}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

async function ensureIndex(db: Kysely<any>, name: string, table: string, columns: string[]): Promise<void> {
  if (await indexExists(db, table, name)) return;
  await db.schema.createIndex(name).on(table).columns(columns).execute();
}

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

  await ensureIndex(db, "idx_playlists_churchId", "playlists", ["churchId"]);

  await db.schema
    .createTable("screenGroups")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("defaultPlaylistId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await ensureIndex(db, "idx_screenGroups_churchId", "screenGroups", ["churchId"]);

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

  await ensureIndex(db, "idx_scheduleEntries_churchId_screenGroupId", "scheduleEntries", ["churchId", "screenGroupId"]);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scheduleEntries").ifExists().execute();
  await db.schema.dropTable("screenGroups").ifExists().execute();
  await db.schema.dropTable("playlists").ifExists().execute();
}
