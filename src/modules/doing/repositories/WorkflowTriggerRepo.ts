import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { WorkflowTrigger } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class WorkflowTriggerRepo {
  public async save(model: WorkflowTrigger) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: WorkflowTrigger): Promise<WorkflowTrigger> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("workflowTriggers").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      eventType: model.eventType,
      workflowId: model.workflowId,
      stepId: model.stepId || null,
      conditions: model.conditions || null,
      oncePerSubject: model.oncePerSubject ?? true,
      active: model.active ?? true
    }).execute();
    return model;
  }

  private async update(model: WorkflowTrigger): Promise<WorkflowTrigger> {
    await getDb().updateTable("workflowTriggers").set({
      name: model.name,
      eventType: model.eventType,
      workflowId: model.workflowId,
      stepId: model.stepId || null,
      conditions: model.conditions || null,
      oncePerSubject: model.oncePerSubject ?? true,
      active: model.active
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("workflowTriggers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("workflowTriggers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("workflowTriggers").selectAll().where("churchId", "=", churchId).orderBy("name").execute();
  }

  public async loadByWorkflow(churchId: string, workflowId: string) {
    return getDb().selectFrom("workflowTriggers").selectAll().where("churchId", "=", churchId).where("workflowId", "=", workflowId).execute();
  }

  public async loadByEventType(churchId: string, eventType: string) {
    return getDb().selectFrom("workflowTriggers").selectAll()
      .where("churchId", "=", churchId)
      .where("eventType", "=", eventType)
      .where("active", "=", true as any)
      .execute();
  }

  // The cheap per-church gate: which event types have at least one active trigger.
  public async loadEventTypesForChurch(churchId: string): Promise<string[]> {
    const rows = await getDb().selectFrom("workflowTriggers")
      .select("eventType")
      .distinct()
      .where("churchId", "=", churchId)
      .where("active", "=", true as any)
      .execute();
    return rows.map((r: any) => r.eventType).filter(Boolean);
  }
}
