import { type Kysely, sql } from "kysely";

// Event-driven workflow triggers: "when <event> happens to a record matching
// <conditions>, add the subject to <workflow>". Companion to the form/scheduled
// triggers. triggerId is stamped on the card it creates for dedup.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("workflowTriggers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("eventType", sql`varchar(50)`)
    .addColumn("workflowId", sql`char(11)`)
    .addColumn("stepId", sql`char(11)`)
    .addColumn("conditions", sql`text`)
    .addColumn("oncePerSubject", sql`bit(1)`, (col) => col.defaultTo(sql`b'1'`))
    .addColumn("active", sql`bit(1)`, (col) => col.defaultTo(sql`b'1'`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_workflowTriggers_churchId_eventType").on("workflowTriggers").columns(["churchId", "eventType"]).execute();

  await db.schema.alterTable("tasks").addColumn("triggerId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_tasks_churchId_triggerId").on("tasks").columns(["churchId", "triggerId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_tasks_churchId_triggerId").on("tasks").ifExists().execute();
  await db.schema.alterTable("tasks").dropColumn("triggerId").execute();

  await db.schema.dropIndex("idx_workflowTriggers_churchId_eventType").on("workflowTriggers").ifExists().execute();
  await db.schema.dropTable("workflowTriggers").ifExists().execute();
}
