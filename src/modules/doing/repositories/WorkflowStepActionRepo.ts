import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { WorkflowStepAction } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class WorkflowStepActionRepo {
  public async save(model: WorkflowStepAction) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: WorkflowStepAction): Promise<WorkflowStepAction> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("workflowStepActions").values({
      id: model.id,
      churchId: model.churchId,
      stepId: model.stepId,
      sort: model.sort,
      actionType: model.actionType,
      config: model.config
    }).execute();
    return model;
  }

  private async update(model: WorkflowStepAction): Promise<WorkflowStepAction> {
    await getDb().updateTable("workflowStepActions").set({
      stepId: model.stepId,
      sort: model.sort,
      actionType: model.actionType,
      config: model.config
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("workflowStepActions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteForStep(churchId: string, stepId: string) {
    await getDb().deleteFrom("workflowStepActions").where("churchId", "=", churchId).where("stepId", "=", stepId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("workflowStepActions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForStep(churchId: string, stepId: string) {
    return getDb().selectFrom("workflowStepActions").selectAll().where("churchId", "=", churchId).where("stepId", "=", stepId).orderBy("sort").execute();
  }

  public async loadForWorkflow(churchId: string, workflowId: string) {
    return getDb().selectFrom("workflowStepActions as a")
      .innerJoin("workflowSteps as s", "s.id", "a.stepId")
      .selectAll("a")
      .where("a.churchId", "=", churchId)
      .where("s.workflowId", "=", workflowId)
      .orderBy("a.sort")
      .execute();
  }
}
