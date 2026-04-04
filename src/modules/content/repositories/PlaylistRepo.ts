import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Playlist } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class PlaylistRepo {
  public async save(model: Playlist) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Playlist): Promise<Playlist> {
    model.id = UniqueIdHelper.shortId();
    const m: any = { ...model };
    if (m.publishDate) m.publishDate = DateHelper.toMysqlDate(m.publishDate);
    await getDb().insertInto("playlists").values({
      id: model.id,
      churchId: model.churchId,
      title: m.title,
      description: m.description,
      publishDate: m.publishDate,
      thumbnail: m.thumbnail
    } as any).execute();
    return model;
  }

  private async update(model: Playlist): Promise<Playlist> {
    const m: any = { ...model };
    if (m.publishDate) m.publishDate = DateHelper.toMysqlDate(m.publishDate);
    await getDb().updateTable("playlists").set({
      title: m.title,
      description: m.description,
      publishDate: m.publishDate,
      thumbnail: m.thumbnail
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("playlists").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Playlist | undefined> {
    return (await getDb().selectFrom("playlists").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public loadById(id: string, churchId: string): Promise<Playlist | undefined> {
    return this.load(churchId, id);
  }

  public async loadAll(churchId: string): Promise<Playlist[]> {
    return getDb().selectFrom("playlists").selectAll().where("churchId", "=", churchId).orderBy("publishDate", "desc").execute() as any;
  }

  public async loadPublicAll(churchId: string): Promise<Playlist[]> {
    return getDb().selectFrom("playlists").selectAll().where("churchId", "=", churchId).orderBy("publishDate", "desc").execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as Playlist; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Playlist[]; }

  protected rowToModel(row: any): Playlist {
    return {
      id: row.id,
      churchId: row.churchId,
      title: row.title,
      description: row.description,
      publishDate: row.publishDate,
      thumbnail: row.thumbnail
    };
  }
}
