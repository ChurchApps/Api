import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PlanItem } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class PlanItemRepo {
  public async save(model: PlanItem) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PlanItem): Promise<PlanItem> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("planItems").values({
      id: model.id, churchId: model.churchId, planId: model.planId, parentId: model.parentId, sort: model.sort, itemType: model.itemType, relatedId: model.relatedId, label: model.label, description: model.description, seconds: model.seconds, link: model.link, providerId: model.providerId, providerPath: model.providerPath, providerContentPath: model.providerContentPath, thumbnailUrl: model.thumbnailUrl
    }).execute();
    return model;
  }

  private async update(model: PlanItem): Promise<PlanItem> {
    await getDb().updateTable("planItems").set({
      planId: model.planId, parentId: model.parentId, sort: model.sort, itemType: model.itemType, relatedId: model.relatedId, label: model.label, description: model.description, seconds: model.seconds, link: model.link, providerId: model.providerId, providerPath: model.providerPath, providerContentPath: model.providerContentPath, thumbnailUrl: model.thumbnailUrl
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("planItems").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("planItems").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("planItems").selectAll().where("churchId", "=", churchId).execute();
  }

  public async deleteByPlanId(churchId: string, planId: string) {
    await getDb().deleteFrom("planItems").where("churchId", "=", churchId).where("planId", "=", planId).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    return getDb().selectFrom("planItems").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async loadForPlan(churchId: string, planId: string) {
    return getDb().selectFrom("planItems").selectAll().where("churchId", "=", churchId).where("planId", "=", planId).orderBy("sort").execute();
  }
}
