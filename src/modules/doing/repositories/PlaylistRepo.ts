import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Playlist } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class PlaylistRepo {
  public async save(model: Playlist) {
    model.updatedAt = new Date();
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Playlist): Promise<Playlist> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("playlists").values({ id: model.id, churchId: model.churchId, name: model.name, items: JSON.stringify(model.items || []), updatedAt: model.updatedAt }).execute();
    return model;
  }

  private async update(model: Playlist): Promise<Playlist> {
    await getDb().updateTable("playlists").set({ name: model.name, items: JSON.stringify(model.items || []), updatedAt: model.updatedAt }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("playlists").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("playlists").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("playlists").selectAll().where("churchId", "=", churchId).orderBy("name").execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  protected rowToModel(row: any): Playlist {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      items: PlaylistRepo.parseJson(row.items) || [],
      updatedAt: row.updatedAt
    };
  }

  public static parseJson(value: unknown) {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return value as any;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
