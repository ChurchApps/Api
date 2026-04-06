import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { VisibilityPreference } from "../models/index.js";

@injectable()
export class VisibilityPreferenceRepo {
  public async save(model: VisibilityPreference) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: VisibilityPreference): Promise<VisibilityPreference> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("visibilityPreferences").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      address: model.address,
      phoneNumber: model.phoneNumber,
      email: model.email
    }).execute();
    return model;
  }

  private async update(model: VisibilityPreference): Promise<VisibilityPreference> {
    await getDb().updateTable("visibilityPreferences").set({
      personId: model.personId,
      address: model.address,
      phoneNumber: model.phoneNumber,
      email: model.email
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("visibilityPreferences").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("visibilityPreferences").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("visibilityPreferences").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForPerson(churchId: string, personId: string): Promise<any> {
    return (await getDb().selectFrom("visibilityPreferences").selectAll().where("churchId", "=", churchId).where("personId", "=", personId).executeTakeFirst()) ?? null;
  }

  public saveAll(models: VisibilityPreference[]) {
    const promises: Promise<VisibilityPreference>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: VisibilityPreference): Promise<VisibilityPreference> {
    return this.create(model);
  }

  protected rowToModel(row: any): VisibilityPreference {
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      address: row.address,
      phoneNumber: row.phoneNumber,
      email: row.email
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
