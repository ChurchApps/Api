import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Household } from "../models/index.js";

@injectable()
export class HouseholdRepo {
  public async save(model: Household) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Household): Promise<Household> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("households").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name
    }).execute();
    return model;
  }

  private async update(model: Household): Promise<Household> {
    await getDb().updateTable("households").set({
      name: model.name
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("households").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteUnused(churchId: string) {
    await getDb().deleteFrom("households")
      .where("churchId", "=", churchId)
      .where("id", "not in",
        getDb().selectFrom("people")
          .select("householdId")
          .where("churchId", "=", churchId)
          .where("householdId", "is not", null)
          .groupBy("householdId")
      )
      .execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("households").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("households").selectAll().where("churchId", "=", churchId).execute();
  }

  public saveAll(models: Household[]) {
    const promises: Promise<Household>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Household): Promise<Household> {
    return this.create(model);
  }

  protected rowToModel(row: any): Household {
    return {
      id: row.id,
      churchId: row.churchId,
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
