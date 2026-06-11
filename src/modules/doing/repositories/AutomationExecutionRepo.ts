import { injectable } from "inversify";
import { sql } from "kysely";
import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { AutomationExecution } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class AutomationExecutionRepo {
  public async save(model: AutomationExecution) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: AutomationExecution): Promise<AutomationExecution> {
    model.id = UniqueIdHelper.shortId();
    model.dateCreated = new Date();
    await getDb().insertInto("automationExecutions").values({
      id: model.id,
      churchId: model.churchId,
      triggerId: model.triggerId,
      workflowId: model.workflowId || null,
      subjectType: model.subjectType || null,
      subjectId: model.subjectId || null,
      subjectLabel: model.subjectLabel || null,
      eventType: model.eventType || null,
      status: model.status,
      attemptCount: model.attemptCount ?? 0,
      nextAttemptAt: (model.nextAttemptAt ? DateHelper.toMysqlDate(model.nextAttemptAt) : null) as any,
      lastError: model.lastError || null,
      dateCreated: sql`now()` as any,
      dateCompleted: (model.dateCompleted ? DateHelper.toMysqlDate(model.dateCompleted) : null) as any
    }).execute();
    return model;
  }

  private async update(model: AutomationExecution): Promise<AutomationExecution> {
    await getDb().updateTable("automationExecutions").set({
      status: model.status,
      attemptCount: model.attemptCount ?? 0,
      nextAttemptAt: (model.nextAttemptAt ? DateHelper.toMysqlDate(model.nextAttemptAt) : null) as any,
      lastError: model.lastError || null,
      dateCompleted: (model.dateCompleted ? DateHelper.toMysqlDate(model.dateCompleted) : null) as any
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("automationExecutions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForTrigger(churchId: string, triggerId: string, limit = 100) {
    return getDb().selectFrom("automationExecutions").selectAll()
      .where("churchId", "=", churchId)
      .where("triggerId", "=", triggerId)
      .orderBy("dateCreated", "desc")
      .limit(limit)
      .execute();
  }

  public async loadForWorkflow(churchId: string, workflowId: string, limit = 200) {
    return getDb().selectFrom("automationExecutions").selectAll()
      .where("churchId", "=", churchId)
      .where("workflowId", "=", workflowId)
      .orderBy("dateCreated", "desc")
      .limit(limit)
      .execute();
  }

  // Cross-church: pending rows whose retry window has arrived (the timer worker).
  public async loadDuePending(limit = 100) {
    return getDb().selectFrom("automationExecutions").selectAll()
      .where("status", "=", "pending")
      .where("nextAttemptAt", "<=", sql`now()` as any)
      .orderBy("nextAttemptAt")
      .limit(limit)
      .execute();
  }

  public async setStatusForTrigger(churchId: string, triggerId: string, fromStatus: string, toStatus: string) {
    await getDb().updateTable("automationExecutions")
      .set({ status: toStatus, nextAttemptAt: (toStatus === "pending" ? DateHelper.toMysqlDate(new Date()) : null) as any })
      .where("churchId", "=", churchId)
      .where("triggerId", "=", triggerId)
      .where("status", "=", fromStatus)
      .execute();
  }

  // Retention sweep — history must cover at least 32 days (PC parity); we keep 90.
  public async purgeOld(days = 90) {
    await getDb().deleteFrom("automationExecutions")
      .where("status", "in", ["success", "failed"])
      .where("dateCreated", "<", sql`date_sub(now(), interval ${days} day)` as any)
      .execute();
  }
}
