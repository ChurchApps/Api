import { type Kysely, sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";

// Must sort AFTER 2026-06-07_unify_form_triggers.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("workflowTriggers").addColumn("triggerKind", sql`varchar(20)`, (col) => col.notNull().defaultTo("event")).execute();
  await db.schema.alterTable("workflowTriggers").addColumn("recurs", sql`varchar(45)`).execute();

  await db.schema.alterTable("conjunctions").addColumn("triggerId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_conjunctions_triggerId").on("conjunctions").columns(["triggerId"]).execute();

  await sql`
    INSERT INTO workflowTriggers (id, churchId, name, triggerKind, eventType, recurs, workflowId, stepId, conditions, oncePerSubject, active)
    SELECT a.id, a.churchId, a.title, 'schedule', NULL, a.recurs,
      JSON_UNQUOTE(JSON_EXTRACT(act.actionData, '$.workflowId')), NULL, NULL, b'0', a.active
    FROM automations a JOIN actions act ON act.automationId = a.id
    WHERE act.actionType = 'addToWorkflow'
      AND JSON_UNQUOTE(JSON_EXTRACT(act.actionData, '$.workflowId')) IS NOT NULL
  `.execute(db);

  const taskAutos = await sql<{ id: string; churchId: string; title: string; recurs: string; active: number; actionData: string }>`
    SELECT a.id, a.churchId, a.title, a.recurs, (a.active + 0) AS active, act.actionData
    FROM automations a JOIN actions act ON act.automationId = a.id
    WHERE act.actionType = 'task'
  `.execute(db);

  for (const row of taskAutos.rows) {
    const workflowId = UniqueIdHelper.shortId();
    const stepId = UniqueIdHelper.shortId();
    let details: { title?: string; assignedToType?: string; assignedToId?: string; assignedToLabel?: string } = {};
    try { details = JSON.parse(row.actionData || "{}"); } catch { /* keep defaults */ }
    const stepName = details.title || row.title || "Task";
    const activeBit = row.active ? sql`b'1'` : sql`b'0'`;

    await sql`INSERT INTO workflows (id, churchId, name, active, sort) VALUES (${workflowId}, ${row.churchId}, ${row.title}, ${activeBit}, 0)`.execute(db);
    await sql`INSERT INTO workflowSteps (id, churchId, workflowId, name, sort, defaultAssignToType, defaultAssignToId, defaultAssignToLabel)
      VALUES (${stepId}, ${row.churchId}, ${workflowId}, ${stepName}, 1, ${details.assignedToType ?? null}, ${details.assignedToId ?? null}, ${details.assignedToLabel ?? null})`.execute(db);
    await sql`INSERT INTO workflowTriggers (id, churchId, name, triggerKind, eventType, recurs, workflowId, stepId, conditions, oncePerSubject, active)
      VALUES (${row.id}, ${row.churchId}, ${row.title}, 'schedule', NULL, ${row.recurs}, ${workflowId}, ${stepId}, NULL, b'0', ${activeBit})`.execute(db);
  }

  await sql`UPDATE conjunctions SET triggerId = automationId WHERE automationId IS NOT NULL`.execute(db);
  await sql`UPDATE tasks SET triggerId = automationId WHERE triggerId IS NULL AND automationId IS NOT NULL`.execute(db);

  await db.schema.alterTable("conjunctions").dropColumn("automationId").execute();
  await db.schema.dropTable("actions").ifExists().execute();
  await db.schema.dropTable("automations").ifExists().execute();

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

  await db.schema
    .createTable("automations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("title", sql`varchar(45)`)
    .addColumn("recurs", sql`varchar(45)`)
    .addColumn("active", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("actions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("automationId", sql`char(11)`)
    .addColumn("actionType", sql`varchar(45)`)
    .addColumn("actionData", sql`mediumtext`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.alterTable("conjunctions").addColumn("automationId", sql`char(11)`).execute();
  await sql`UPDATE conjunctions SET automationId = triggerId WHERE triggerId IS NOT NULL`.execute(db);
  await db.schema.dropIndex("idx_conjunctions_triggerId").on("conjunctions").ifExists().execute();
  await db.schema.alterTable("conjunctions").dropColumn("triggerId").execute();

  await sql`DELETE FROM workflowTriggers WHERE triggerKind = 'schedule'`.execute(db);
  await db.schema.alterTable("workflowTriggers").dropColumn("recurs").execute();
  await db.schema.alterTable("workflowTriggers").dropColumn("triggerKind").execute();
}
