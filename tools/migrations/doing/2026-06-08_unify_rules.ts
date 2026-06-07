import { type Kysely, sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";

// Unify the two condition->action engines into one. The standalone automations engine
// (automations + actions tables) is folded into workflowTriggers as triggerKind='schedule'
// rules, reusing each automation's id as the trigger id so the relational condition tree
// (conjunctions/conditions) repoints with a simple rename:
//   - addToWorkflow automations -> a schedule rule targeting the same workflow.
//   - task automations          -> a single-step workflow + a schedule rule targeting it
//                                   (a bare scheduled task is just a one-step workflow card).
// Then conjunctions.automationId is replaced by triggerId and the automations/actions
// tables are dropped. Must sort AFTER 2026-06-07_unify_form_triggers.

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Conjunctions gain a triggerId owner (alongside the existing stepRouteId).
  await db.schema.alterTable("conjunctions").addColumn("triggerId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_conjunctions_triggerId").on("conjunctions").columns(["triggerId"]).execute();

  // 2. addToWorkflow automations -> schedule rules (reuse the automation id as the trigger id).
  await sql`
    INSERT INTO workflowTriggers (id, churchId, name, triggerKind, eventType, recurs, workflowId, stepId, conditions, oncePerSubject, active)
    SELECT a.id, a.churchId, a.title, 'schedule', NULL, a.recurs,
      JSON_UNQUOTE(JSON_EXTRACT(act.actionData, '$.workflowId')), NULL, NULL, b'0', a.active
    FROM automations a JOIN actions act ON act.automationId = a.id
    WHERE act.actionType = 'addToWorkflow'
      AND JSON_UNQUOTE(JSON_EXTRACT(act.actionData, '$.workflowId')) IS NOT NULL
  `.execute(db);

  // 3. task automations -> single-step workflow + schedule rule (reuse automation id as trigger id).
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

  // 4. Repoint the condition tree from automationId to the (same-id) triggerId.
  await sql`UPDATE conjunctions SET triggerId = automationId WHERE automationId IS NOT NULL`.execute(db);

  // 5. Carry automation dedup history onto cards (triggerId == old automationId).
  await sql`UPDATE tasks SET triggerId = automationId WHERE triggerId IS NULL AND automationId IS NOT NULL`.execute(db);

  // 6. Retire the legacy owner column and tables.
  //    (Reconcile: schedule-rule count == count(actions) for addToWorkflow + task types.)
  await db.schema.alterTable("conjunctions").dropColumn("automationId").execute();
  await db.schema.dropTable("actions").ifExists().execute();
  await db.schema.dropTable("automations").ifExists().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Recreate the table/column shells (row data is not reconstructed). Mirrors the
  // 2026-06-07 precedent of shell-only down migrations for this folding pattern.
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
}
