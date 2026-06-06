import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Workflow } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class WorkflowRepo {
  public async save(model: Workflow) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Workflow): Promise<Workflow> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("workflows").values({ id: model.id, churchId: model.churchId, name: model.name, categoryId: model.categoryId, active: model.active ?? true, sort: model.sort }).execute();
    return model;
  }

  private async update(model: Workflow): Promise<Workflow> {
    await getDb().updateTable("workflows").set({ name: model.name, categoryId: model.categoryId, active: model.active, sort: model.sort }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("workflows").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("workflows").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("workflows").selectAll().where("churchId", "=", churchId).orderBy("sort").orderBy("name").execute();
  }
}
