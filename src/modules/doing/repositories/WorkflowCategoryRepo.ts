import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { WorkflowCategory } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class WorkflowCategoryRepo {
  public async save(model: WorkflowCategory) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: WorkflowCategory): Promise<WorkflowCategory> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("workflowCategories").values({ id: model.id, churchId: model.churchId, name: model.name, sort: model.sort }).execute();
    return model;
  }

  private async update(model: WorkflowCategory): Promise<WorkflowCategory> {
    await getDb().updateTable("workflowCategories").set({ name: model.name, sort: model.sort }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("workflowCategories").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("workflowCategories").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("workflowCategories").selectAll().where("churchId", "=", churchId).orderBy("sort").orderBy("name").execute();
  }
}
