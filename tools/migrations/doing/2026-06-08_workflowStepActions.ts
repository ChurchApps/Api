import { type Kysely, sql } from "kysely";

// On-enter step actions: a step's ordered workflowStepActions run when a card enters it.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("workflowStepActions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("stepId", sql`char(11)`)
    .addColumn("sort", sql`int`)
    .addColumn("actionType", sql`varchar(40)`)
    .addColumn("config", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_workflowStepActions_churchId_stepId").on("workflowStepActions").columns(["churchId", "stepId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_workflowStepActions_churchId_stepId").on("workflowStepActions").ifExists().execute();
  await db.schema.dropTable("workflowStepActions").ifExists().execute();
}
