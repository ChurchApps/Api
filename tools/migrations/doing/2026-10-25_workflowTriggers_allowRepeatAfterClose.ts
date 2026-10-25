import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("workflowTriggers").addColumn("allowRepeatAfterClose", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`b'0'`)).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("workflowTriggers").dropColumn("allowRepeatAfterClose").execute();
}
