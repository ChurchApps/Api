import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { WorkflowStepRoute } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class WorkflowStepRouteRepo {
  public async save(model: WorkflowStepRoute) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: WorkflowStepRoute): Promise<WorkflowStepRoute> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("workflowStepRoutes").values({
      id: model.id,
      churchId: model.churchId,
      workflowId: model.workflowId,
      stepId: model.stepId,
      sort: model.sort,
      trigger: model.trigger,
      kind: model.kind,
      label: model.label,
      targetStepId: model.targetStepId,
      targetWorkflowId: model.targetWorkflowId
    }).execute();
    return model;
  }

  private async update(model: WorkflowStepRoute): Promise<WorkflowStepRoute> {
    await getDb().updateTable("workflowStepRoutes").set({
      workflowId: model.workflowId,
      stepId: model.stepId,
      sort: model.sort,
      trigger: model.trigger,
      kind: model.kind,
      label: model.label,
      targetStepId: model.targetStepId,
      targetWorkflowId: model.targetWorkflowId
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("workflowStepRoutes").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("workflowStepRoutes").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForStep(churchId: string, stepId: string) {
    return getDb().selectFrom("workflowStepRoutes").selectAll().where("churchId", "=", churchId).where("stepId", "=", stepId).orderBy("sort").execute();
  }

  public async loadForWorkflow(churchId: string, workflowId: string) {
    return getDb().selectFrom("workflowStepRoutes").selectAll().where("churchId", "=", churchId).where("workflowId", "=", workflowId).orderBy("sort").execute();
  }
}
