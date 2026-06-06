import { type Kysely, sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";

// Conditional routing for Workflows ("if this then that"). A workflowStepRoute is
// a conditional exit from a step:
//   trigger = onEnter   -> evaluated automatically when a card enters the step
//             onComplete -> shown to the user as an outcome button on completion
//   kind    = outcome     (human-picked button, no predicate)
//             personMatch (evaluate a condition tree vs the card's person)
//             always      (unconditional default / fallthrough)
//   targetStepId NULL    -> complete/close the card.
// personMatch routes reuse the existing Condition/Conjunction engine via a new
// stepRouteId column on conjunctions. The previously-unconditional `autoAdvance`
// step action is migrated into onEnter/always routes.
//
// NOTE: the filename sorts AFTER `2026-06-05_workflows` deliberately — this
// migration depends on the workflowSteps table and the actions.stepId column
// that migration creates.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("workflowStepRoutes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("workflowId", sql`char(11)`)
    .addColumn("stepId", sql`char(11)`)
    .addColumn("sort", sql`int`)
    .addColumn("trigger", sql`varchar(20)`)
    .addColumn("kind", sql`varchar(20)`)
    .addColumn("label", sql`varchar(255)`)
    .addColumn("targetStepId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_workflowStepRoutes_churchId_stepId").on("workflowStepRoutes").columns(["churchId", "stepId"]).execute();
  await db.schema.createIndex("idx_workflowStepRoutes_churchId_workflowId").on("workflowStepRoutes").columns(["churchId", "workflowId"]).execute();

  // personMatch routes own a condition tree, keyed by stepRouteId (parallels actions.stepId).
  await db.schema.alterTable("conjunctions").addColumn("stepRouteId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_conjunctions_stepRouteId").on("conjunctions").columns(["stepRouteId"]).execute();

  // Data-migrate existing unconditional autoAdvance step actions into onEnter/always routes.
  const actions = await db
    .selectFrom("actions")
    .select(["id", "churchId", "stepId", "actionData"])
    .where("actionType", "=", "autoAdvance")
    .where("stepId", "is not", null)
    .execute();

  for (const action of actions as Array<{ id: string; churchId: string; stepId: string; actionData: string | null }>) {
    let targetStepId: string | undefined;
    try {
      targetStepId = action.actionData ? JSON.parse(action.actionData).targetStepId : undefined;
    } catch {
      targetStepId = undefined;
    }
    const step = await db.selectFrom("workflowSteps").select(["workflowId"]).where("id", "=", action.stepId).executeTakeFirst();
    await db
      .insertInto("workflowStepRoutes")
      .values({
        id: UniqueIdHelper.shortId(),
        churchId: action.churchId,
        workflowId: (step as { workflowId?: string } | undefined)?.workflowId ?? null,
        stepId: action.stepId,
        sort: 1,
        trigger: "onEnter",
        kind: "always",
        label: null,
        targetStepId: targetStepId ?? null
      })
      .execute();
    await db.deleteFrom("actions").where("id", "=", action.id).execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_conjunctions_stepRouteId").on("conjunctions").ifExists().execute();
  await db.schema.alterTable("conjunctions").dropColumn("stepRouteId").execute();
  await db.schema.dropIndex("idx_workflowStepRoutes_churchId_workflowId").on("workflowStepRoutes").ifExists().execute();
  await db.schema.dropIndex("idx_workflowStepRoutes_churchId_stepId").on("workflowStepRoutes").ifExists().execute();
  await db.schema.dropTable("workflowStepRoutes").ifExists().execute();
}
