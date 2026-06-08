import { type Kysely, sql } from "kysely";

// Must run before 2026-06-08_unify_rules, which inserts schedule rules using these columns.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("workflowTriggers").addColumn("triggerKind", sql`varchar(20)`, (col) => col.notNull().defaultTo("event")).execute();
  await db.schema.alterTable("workflowTriggers").addColumn("recurs", sql`varchar(45)`).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("workflowTriggers").dropColumn("recurs").execute();
  await db.schema.alterTable("workflowTriggers").dropColumn("triggerKind").execute();
}
