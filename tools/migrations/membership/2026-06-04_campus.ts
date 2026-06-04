import { type Kysely, sql } from "kysely";

// Planning-Center-style church-wide Campus support.
//
// Promotes the membership `campuses` table from an unused { id, name } stub to
// the canonical church-scoped campus entity (churchId + address + timezone +
// website), and lets People and Groups belong to a campus via campusId.
// NULL campusId = "unassigned".
//
// NOTE: seeding these campuses from the existing attendance campuses and the
// smart-hybrid backfill of people.campusId / groups.campusId are performed by
// the hand-run cross-database script tools/manual/campus-reconcile.sql — a
// per-module migration runs against the membership database only and cannot
// read the separate attendance database.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("campuses")
    .addColumn("churchId", sql`char(11)`)
    .addColumn("address1", sql`varchar(255)`)
    .addColumn("address2", sql`varchar(255)`)
    .addColumn("city", sql`varchar(255)`)
    .addColumn("state", sql`varchar(255)`)
    .addColumn("zip", sql`varchar(255)`)
    .addColumn("timezone", sql`varchar(100)`)
    .addColumn("website", sql`varchar(255)`)
    .addColumn("importKey", sql`varchar(255)`)
    .addColumn("removed", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`0`))
    .execute();
  await db.schema.createIndex("idx_campuses_churchId").on("campuses").columns(["churchId"]).execute();

  await db.schema.alterTable("people").addColumn("campusId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_people_campusId").on("people").columns(["campusId"]).execute();

  await db.schema.alterTable("groups").addColumn("campusId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_groups_campusId").on("groups").columns(["campusId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_groups_campusId").on("groups").ifExists().execute();
  await db.schema.alterTable("groups").dropColumn("campusId").execute();

  await db.schema.dropIndex("idx_people_campusId").on("people").ifExists().execute();
  await db.schema.alterTable("people").dropColumn("campusId").execute();

  await db.schema.dropIndex("idx_campuses_churchId").on("campuses").ifExists().execute();
  await db.schema
    .alterTable("campuses")
    .dropColumn("churchId")
    .dropColumn("address1")
    .dropColumn("address2")
    .dropColumn("city")
    .dropColumn("state")
    .dropColumn("zip")
    .dropColumn("timezone")
    .dropColumn("website")
    .dropColumn("importKey")
    .dropColumn("removed")
    .execute();
}
