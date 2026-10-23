import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").addColumn("confirmationWorkflowId", sql`char(11)`).execute();
  await db.schema.alterTable("assignments").addColumn("confirmationWorkflowId", sql`char(11)`).execute();
  await db.schema.alterTable("workflows").addColumn("workflowType", sql`varchar(40)`).execute();
  await db.schema.alterTable("tasks").addColumn("assignmentId", sql`char(11)`).addColumn("followupKey", sql`varchar(80)`).execute();
  await db.schema.createIndex("idx_tasks_assignment").on("tasks").columns(["churchId", "assignmentId"]).execute();
  await db.schema.createIndex("uq_tasks_followup").unique().on("tasks").columns(["churchId", "followupKey"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("uq_tasks_followup").on("tasks").execute();
  await db.schema.dropIndex("idx_tasks_assignment").on("tasks").execute();
  await db.schema.alterTable("tasks").dropColumn("followupKey").dropColumn("assignmentId").execute();
  await db.schema.alterTable("workflows").dropColumn("workflowType").execute();
  await db.schema.alterTable("assignments").dropColumn("confirmationWorkflowId").execute();
  await db.schema.alterTable("plans").dropColumn("confirmationWorkflowId").execute();
}
