import { type Kysely, sql } from "kysely";

// Phase 4 of campus support: a Plan (worship/volunteer schedule) can belong to
// a church-wide campus, matching Planning Center where plans are campus-scoped.
// campusId references membership.campuses.id (no cross-DB FK; ids are shared).
// NULL = unassigned.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").addColumn("campusId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_plans_campusId").on("plans").columns(["campusId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_plans_campusId").on("plans").ifExists().execute();
  await db.schema.alterTable("plans").dropColumn("campusId").execute();
}
