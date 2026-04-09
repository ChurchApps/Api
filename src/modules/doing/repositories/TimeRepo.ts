import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Time } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class TimeRepo {
  public async save(model: Time) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Time): Promise<Time> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("times").values({ id: model.id, churchId: model.churchId, planId: model.planId, displayName: model.displayName, startTime: model.startTime, endTime: model.endTime, teams: model.teams }).execute();
    return model;
  }

  private async update(model: Time): Promise<Time> {
    await getDb().updateTable("times").set({ planId: model.planId, displayName: model.displayName, startTime: model.startTime, endTime: model.endTime, teams: model.teams }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("times").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("times").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("times").selectAll().where("churchId", "=", churchId).execute();
  }

  public async deleteByPlanId(churchId: string, planId: string) {
    await getDb().deleteFrom("times").where("churchId", "=", churchId).where("planId", "=", planId).execute();
  }

  public async loadByPlanId(churchId: string, planId: string) {
    return getDb().selectFrom("times").selectAll().where("churchId", "=", churchId).where("planId", "=", planId).execute();
  }

  public async loadByPlanIds(churchId: string, planIds: string[]) {
    if (planIds.length === 0) return [];
    return getDb().selectFrom("times").selectAll().where("churchId", "=", churchId).where("planId", "in", planIds).execute();
  }
}
