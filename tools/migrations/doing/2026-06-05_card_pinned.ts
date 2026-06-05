import { type Kysely, sql } from "kysely";

// Pinned assignment: when set, a card keeps its current assignee across step
// changes instead of re-assigning to each step's default (PCO-style pinning).

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("tasks").addColumn("pinnedAssignment", sql`bit(1)`, (col) => col.defaultTo(sql`b'0'`)).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("tasks").dropColumn("pinnedAssignment").execute();
}
