import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Setting } from "../models/index.js";

@injectable()
export class SettingRepo {
  public async save(model: Setting) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Setting): Promise<Setting> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("settings").values({
      id: model.id,
      churchId: model.churchId,
      keyName: model.keyName,
      value: model.value,
      public: model.public
    }).execute();
    return model;
  }

  private async update(model: Setting): Promise<Setting> {
    await getDb().updateTable("settings").set({
      keyName: model.keyName,
      value: model.value,
      public: model.public
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("settings").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("settings").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("settings").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadPublicSettings(churchId: string) {
    return getDb().selectFrom("settings").selectAll().where("churchId", "=", churchId).where("public", "=", true as any).execute();
  }

  public async loadMulipleChurches(keyNames: string[], churchIds: string[]) {
    if (!keyNames.length || !churchIds.length) return [];
    return getDb().selectFrom("settings").selectAll()
      .where("keyName", "in", keyNames)
      .where("churchId", "in", churchIds)
      .where("public", "=", true as any)
      .execute();
  }

  public saveAll(models: Setting[]) {
    const promises: Promise<Setting>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Setting): Promise<Setting> {
    return this.create(model);
  }

  protected rowToModel(row: any): Setting {
    return {
      id: row.id,
      churchId: row.churchId,
      keyName: row.keyName,
      value: row.value,
      public: row.public
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
