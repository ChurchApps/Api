import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Position } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class PositionRepo {
  public async save(model: Position) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Position): Promise<Position> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("positions").values({ id: model.id, churchId: model.churchId, planId: model.planId, categoryName: model.categoryName, name: model.name, count: model.count, groupId: model.groupId, allowSelfSignup: model.allowSelfSignup, description: model.description }).execute();
    return model;
  }

  private async update(model: Position): Promise<Position> {
    await getDb().updateTable("positions").set({ planId: model.planId, categoryName: model.categoryName, name: model.name, count: model.count, groupId: model.groupId, allowSelfSignup: model.allowSelfSignup, description: model.description }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("positions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("positions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("positions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async deleteByPlanId(churchId: string, planId: string) {
    await getDb().deleteFrom("positions").where("churchId", "=", churchId).where("planId", "=", planId).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    return getDb().selectFrom("positions").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async loadByPlanId(churchId: string, planId: string) {
    return getDb().selectFrom("positions").selectAll().where("churchId", "=", churchId).where("planId", "=", planId).orderBy("categoryName").orderBy("name").execute();
  }

  public async loadByPlanIds(churchId: string, planIds: string[]) {
    return getDb().selectFrom("positions").selectAll().where("churchId", "=", churchId).where("planId", "in", planIds).execute();
  }

  public async loadSignupByPlanId(churchId: string, planId: string) {
    return getDb().selectFrom("positions").selectAll().where("churchId", "=", churchId).where("planId", "=", planId).where("allowSelfSignup", "=", true as any).orderBy("categoryName").orderBy("name").execute();
  }

  protected rowToModel(row: any): Position {
    return {
      id: row.id,
      churchId: row.churchId,
      planId: row.planId,
      categoryName: row.categoryName,
      name: row.name,
      count: row.count,
      groupId: row.groupId,
      allowSelfSignup: row.allowSelfSignup,
      description: row.description
    };
  }
}
