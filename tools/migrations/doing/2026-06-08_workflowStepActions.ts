import { type Kysely, sql } from "kysely";

// Action steps: a workflowStep can be stepType='action', which performs automated
// actions (send email, wait, add to group, note, set field, webhook) on entry and
// then auto-advances the card. stepType defaults to 'human' (today's behavior).

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("workflowSteps").addColumn("stepType", sql`varchar(20)`, (col) => col.defaultTo("human")).execute();

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
  await db.schema.alterTable("workflowSteps").dropColumn("stepType").execute();
}
