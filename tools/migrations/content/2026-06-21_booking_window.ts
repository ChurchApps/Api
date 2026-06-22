import { type Kysely, sql } from "kysely";

// How long a booking reserves its room/resource, in two complementary forms:
//  - setupMinutes/teardownMinutes: per-occurrence padding before/after each event
//    occurrence (recurrence-aware, e.g. "every Saturday 8am-5pm").
//  - startTime/endTime: an absolute one-off span that overrides the above
//    (e.g. a single Fri-Sun retreat). NULL on all four = follows the event exactly.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("eventBookings")
    .addColumn("setupMinutes", sql`int`)
    .addColumn("teardownMinutes", sql`int`)
    .addColumn("startTime", sql`datetime`)
    .addColumn("endTime", sql`datetime`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("eventBookings").dropColumn("setupMinutes").dropColumn("teardownMinutes").dropColumn("startTime").dropColumn("endTime").execute();
}
