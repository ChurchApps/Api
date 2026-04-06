import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Arrangement } from "../models/index.js";

@injectable()
export class ArrangementRepo {
  public async save(model: Arrangement) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Arrangement): Promise<Arrangement> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("arrangements").values({
      id: model.id,
      churchId: model.churchId,
      songId: model.songId,
      songDetailId: model.songDetailId,
      name: model.name,
      lyrics: model.lyrics,
      freeShowId: model.freeShowId
    } as any).execute();
    return model;
  }

  private async update(model: Arrangement): Promise<Arrangement> {
    await getDb().updateTable("arrangements").set({
      songId: model.songId,
      songDetailId: model.songDetailId,
      name: model.name,
      lyrics: model.lyrics,
      freeShowId: model.freeShowId
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("arrangements").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Arrangement | undefined> {
    return (await getDb().selectFrom("arrangements").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Arrangement[]> {
    return getDb().selectFrom("arrangements").selectAll().where("churchId", "=", churchId).orderBy("name").execute() as any;
  }

  public async loadBySongId(churchId: string, songId: string): Promise<Arrangement[]> {
    return getDb().selectFrom("arrangements").selectAll().where("churchId", "=", churchId).where("songId", "=", songId).execute() as any;
  }

  public async loadBySongDetailId(churchId: string, songDetailId: string) {
    return getDb().selectFrom("arrangements").selectAll().where("churchId", "=", churchId).where("songDetailId", "=", songDetailId).execute() as any;
  }

  public async loadByFreeShowId(churchId: string, freeShowId: string) {
    return (await getDb().selectFrom("arrangements").selectAll().where("churchId", "=", churchId).where("freeShowId", "=", freeShowId).executeTakeFirst()) ?? null;
  }

  public convertToModel(_churchId: string, data: any) { return data as Arrangement; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Arrangement[]; }

  protected rowToModel(row: any): Arrangement {
    return {
      id: row.id,
      churchId: row.churchId,
      songId: row.songId,
      songDetailId: row.songDetailId,
      name: row.name,
      lyrics: row.lyrics,
      freeShowId: row.freeShowId
    };
  }
}
