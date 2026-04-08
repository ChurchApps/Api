import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PlanType } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class PlanTypeRepo {
  public async save(model: PlanType) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PlanType): Promise<PlanType> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("planTypes").values({ id: model.id, churchId: model.churchId, ministryId: model.ministryId, name: model.name }).execute();
    return model;
  }

  private async update(model: PlanType): Promise<PlanType> {
    await getDb().updateTable("planTypes").set({ ministryId: model.ministryId, name: model.name }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("planTypes").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("planTypes").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("planTypes").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    return getDb().selectFrom("planTypes").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async loadByMinistryId(churchId: string, ministryId: string) {
    return getDb().selectFrom("planTypes").selectAll().where("churchId", "=", churchId).where("ministryId", "=", ministryId).execute();
  }

  protected rowToModel(row: any): PlanType {
    return {
      id: row.id,
      churchId: row.churchId,
      ministryId: row.ministryId,
      name: row.name
    };
  }

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
