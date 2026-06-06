import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { FormWorkflowTrigger } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class FormWorkflowTriggerRepo {
  public async save(model: FormWorkflowTrigger) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: FormWorkflowTrigger): Promise<FormWorkflowTrigger> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("formWorkflowTriggers").values({ id: model.id, churchId: model.churchId, formId: model.formId, workflowId: model.workflowId, active: model.active ?? true }).execute();
    return model;
  }

  private async update(model: FormWorkflowTrigger): Promise<FormWorkflowTrigger> {
    await getDb().updateTable("formWorkflowTriggers").set({ formId: model.formId, workflowId: model.workflowId, active: model.active }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("formWorkflowTriggers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("formWorkflowTriggers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForWorkflow(churchId: string, workflowId: string) {
    return getDb().selectFrom("formWorkflowTriggers").selectAll().where("churchId", "=", churchId).where("workflowId", "=", workflowId).execute();
  }

  public async loadByForm(churchId: string, formId: string) {
    return getDb().selectFrom("formWorkflowTriggers").selectAll().where("churchId", "=", churchId).where("formId", "=", formId).where("active", "=", true).execute();
  }
}
