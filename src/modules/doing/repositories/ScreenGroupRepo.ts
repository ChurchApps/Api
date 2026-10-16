import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { ScreenGroup } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class ScreenGroupRepo {
  public async save(model: ScreenGroup) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ScreenGroup): Promise<ScreenGroup> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("screenGroups").values({ id: model.id, churchId: model.churchId, name: model.name, defaultPlaylistId: model.defaultPlaylistId || null }).execute();
    return model;
  }

  private async update(model: ScreenGroup): Promise<ScreenGroup> {
    await getDb().updateTable("screenGroups").set({ name: model.name, defaultPlaylistId: model.defaultPlaylistId || null }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("screenGroups").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("screenGroups").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("screenGroups").selectAll().where("churchId", "=", churchId).orderBy("name").execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  protected rowToModel(row: any): ScreenGroup {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      defaultPlaylistId: row.defaultPlaylistId
    };
  }
}
