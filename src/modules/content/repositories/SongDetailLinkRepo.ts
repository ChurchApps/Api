import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { SongDetailLink } from "../models/index.js";

@injectable()
export class SongDetailLinkRepo {
  public async save(model: SongDetailLink) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: SongDetailLink): Promise<SongDetailLink> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("songDetailLinks").values({
      id: model.id,
      songDetailId: model.songDetailId,
      service: model.service,
      serviceKey: model.serviceKey,
      url: model.url
    } as any).execute();
    return model;
  }

  private async update(model: SongDetailLink): Promise<SongDetailLink> {
    await getDb().updateTable("songDetailLinks").set({
      songDetailId: model.songDetailId,
      service: model.service,
      serviceKey: model.serviceKey,
      url: model.url
    }).where("id", "=", model.id).execute();
    return model;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("songDetailLinks").where("id", "=", id).execute();
  }

  public async load(id: string): Promise<SongDetailLink | undefined> {
    return (await getDb().selectFrom("songDetailLinks").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadForSongDetail(songDetailId: string) {
    return getDb().selectFrom("songDetailLinks").selectAll()
      .where("songDetailId", "=", songDetailId)
      .orderBy("service").execute() as any;
  }

  public async loadByServiceAndKey(service: string, serviceKey: string) {
    return (await getDb().selectFrom("songDetailLinks").selectAll()
      .where("service", "=", service)
      .where("serviceKey", "=", serviceKey)
      .executeTakeFirst()) ?? null;
  }

  public convertToModel(data: any) { return data as SongDetailLink; }
  public convertAllToModel(data: any[]) { return (data || []) as SongDetailLink[]; }

  protected rowToModel(row: any): SongDetailLink {
    return {
      id: row.id,
      songDetailId: row.songDetailId,
      service: row.service,
      serviceKey: row.serviceKey,
      url: row.url
    };
  }
}
