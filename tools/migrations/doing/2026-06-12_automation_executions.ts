import { type Kysely, sql } from "kysely";

// Execution history for the rule engine: one row per trigger firing (event, schedule
// or run-now). pending rows are retried with backoff by the scheduled-tasks timer;
// success/failed rows are kept ~90 days for the B1Admin history panel.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("automationExecutions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("triggerId", sql`char(11)`, (col) => col.notNull())
    .addColumn("workflowId", sql`char(11)`)
    .addColumn("subjectType", sql`varchar(45)`)
    .addColumn("subjectId", sql`char(11)`)
    .addColumn("subjectLabel", sql`varchar(255)`)
    .addColumn("eventType", sql`varchar(50)`)
    .addColumn("status", sql`varchar(20)`, (col) => col.notNull())
    .addColumn("attemptCount", sql`int`, (col) => col.defaultTo(0))
    .addColumn("nextAttemptAt", sql`datetime`)
    .addColumn("lastError", sql`text`)
    .addColumn("dateCreated", sql`datetime`, (col) => col.notNull())
    .addColumn("dateCompleted", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_automationExecutions_churchId_triggerId_dateCreated").on("automationExecutions").columns(["churchId", "triggerId", "dateCreated"]).execute();
  await db.schema.createIndex("idx_automationExecutions_status_nextAttemptAt").on("automationExecutions").columns(["status", "nextAttemptAt"]).execute();
  await db.schema.createIndex("idx_automationExecutions_churchId_workflowId_dateCreated").on("automationExecutions").columns(["churchId", "workflowId", "dateCreated"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_automationExecutions_churchId_workflowId_dateCreated").on("automationExecutions").ifExists().execute();
  await db.schema.dropIndex("idx_automationExecutions_status_nextAttemptAt").on("automationExecutions").ifExists().execute();
  await db.schema.dropIndex("idx_automationExecutions_churchId_triggerId_dateCreated").on("automationExecutions").ifExists().execute();
  await db.schema.dropTable("automationExecutions").ifExists().execute();
}
