import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PlanTemplate } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class PlanTemplateRepo {
  public async save(model: PlanTemplate) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PlanTemplate): Promise<PlanTemplate> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("planTemplates").values({ id: model.id, churchId: model.churchId, ministryId: model.ministryId, name: model.name, data: model.data }).execute();
    return model;
  }

  private async update(model: PlanTemplate): Promise<PlanTemplate> {
    await getDb().updateTable("planTemplates").set({ ministryId: model.ministryId, name: model.name, data: model.data }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("planTemplates").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("planTemplates").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByMinistryId(churchId: string, ministryId: string) {
    return getDb().selectFrom("planTemplates").selectAll().where("churchId", "=", churchId).where("ministryId", "=", ministryId).orderBy("name").execute();
  }
}
