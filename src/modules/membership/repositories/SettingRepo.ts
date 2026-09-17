import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Setting } from "../models/index.js";

function isDuplicateKeyError(err: any): boolean {
  return err?.errno === 1062 || err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(err?.message || "");
}

@injectable()
export class SettingRepo {
  public async save(model: Setting) {
    if (!model.id) {
      const existing = await this.findIdByKey(model.churchId, model.keyName);
      if (existing) model.id = existing;
    }
    const saved = model.id ? await this.update(model) : await this.create(model);
    await this.deleteSiblings(saved);
    return saved;
  }

  private async findIdByKey(churchId?: string, keyName?: string) {
    if (!churchId || !keyName) return undefined;
    const existing = await getDb().selectFrom("settings").select("id").where("churchId", "=", churchId).where("keyName", "=", keyName).orderBy("id", "asc").executeTakeFirst();
    return existing?.id;
  }

  private async create(model: Setting): Promise<Setting> {
    model.id = UniqueIdHelper.shortId();
    try {
      await getDb().insertInto("settings").values({
        id: model.id,
        churchId: model.churchId,
        keyName: model.keyName,
        value: model.value,
        public: model.public
      }).execute();
      return model;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const existingId = await this.findIdByKey(model.churchId, model.keyName);
      if (!existingId) throw err;
      model.id = existingId;
      return this.update(model);
    }
  }

  private async update(model: Setting): Promise<Setting> {
    await getDb().updateTable("settings").set({
      keyName: model.keyName,
      value: model.value,
      public: model.public
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  private async deleteSiblings(model: Setting) {
    if (!model.id || !model.churchId || !model.keyName) return;
    await getDb().deleteFrom("settings")
      .where("churchId", "=", model.churchId)
      .where("keyName", "=", model.keyName)
      .where("id", "!=", model.id)
      .execute();
  }

  // Duplicate (churchId, keyName) rows make public settings last-write-win; keep the lowest id so admin and the public gate agree.
  private keepOnePerKey(rows: any[]) {
    if (!rows?.length) return rows || [];
    const best = new Map<string, any>();
    for (const row of rows) {
      const key = `${row.churchId}\t${row.keyName}`;
      const existing = best.get(key);
      if (!existing || String(row.id) < String(existing.id)) best.set(key, row);
    }
    return Array.from(best.values());
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("settings").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("settings").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll().where("churchId", "=", churchId).execute());
  }

  public async loadPublicSettings(churchId: string) {
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll().where("churchId", "=", churchId).where("public", "=", true as any).execute());
  }

  public async loadMulipleChurches(keyNames: string[], churchIds: string[]) {
    if (!keyNames.length || !churchIds.length) return [];
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll()
      .where("keyName", "in", keyNames)
      .where("churchId", "in", churchIds)
      .where("public", "=", true as any)
      .execute());
  }

  // Cross-church: the midnight promotion job sweeps every church's setting in one pass.
  public async loadAllByKeyName(keyName: string) {
    return this.keepOnePerKey(await getDb().selectFrom("settings").selectAll().where("keyName", "=", keyName).execute());
  }

  public saveAll(models: Setting[]) {
    const promises: Promise<Setting>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Setting): Promise<Setting> {
    return this.save({ ...model, id: undefined });
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
