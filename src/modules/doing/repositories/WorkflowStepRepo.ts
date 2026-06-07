import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { WorkflowStep } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class WorkflowStepRepo {
  public async save(model: WorkflowStep) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: WorkflowStep): Promise<WorkflowStep> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("workflowSteps").values({
      id: model.id,
      churchId: model.churchId,
      workflowId: model.workflowId,
      name: model.name,
      sort: model.sort,
      stepType: model.stepType || "human",
      defaultAssignToType: model.defaultAssignToType,
      defaultAssignToId: model.defaultAssignToId,
      defaultAssignToLabel: model.defaultAssignToLabel,
      expectedResponseDays: model.expectedResponseDays
    }).execute();
    return model;
  }

  private async update(model: WorkflowStep): Promise<WorkflowStep> {
    await getDb().updateTable("workflowSteps").set({
      workflowId: model.workflowId,
      name: model.name,
      sort: model.sort,
      stepType: model.stepType || "human",
      defaultAssignToType: model.defaultAssignToType,
      defaultAssignToId: model.defaultAssignToId,
      defaultAssignToLabel: model.defaultAssignToLabel,
      expectedResponseDays: model.expectedResponseDays
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("workflowSteps").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("workflowSteps").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForWorkflow(churchId: string, workflowId: string) {
    return getDb().selectFrom("workflowSteps").selectAll().where("churchId", "=", churchId).where("workflowId", "=", workflowId).orderBy("sort").execute();
  }
}
