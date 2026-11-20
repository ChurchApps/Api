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
      bpm: model.bpm,
      seconds: model.seconds,
      meter: model.meter,
      sequence: model.sequence,
      freeShowId: model.freeShowId
    }).execute();
    return model;
  }

  private async update(model: Arrangement): Promise<Arrangement> {
    await getDb().updateTable("arrangements").set({
      songId: model.songId,
      songDetailId: model.songDetailId,
      name: model.name,
      lyrics: model.lyrics,
      bpm: model.bpm,
      seconds: model.seconds,
      meter: model.meter,
      sequence: model.sequence,
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
    return getDb().selectFrom("arrangements").selectAll().where("churchId", "=", churchId).orderBy("name").execute();
  }

  public async loadBySongId(churchId: string, songId: string): Promise<Arrangement[]> {
    return getDb().selectFrom("arrangements").selectAll().where("churchId", "=", churchId).where("songId", "=", songId).execute();
  }

  // The three lookups below feed the FreeShow sync. They skip arrangements whose song row is
  // gone: older song deletes left those behind, and counting them made the sync treat deleted
  // songs as already uploaded so they never came back (FreeShow#3999).
  private withLiveSong() {
    return getDb().selectFrom("arrangements as a")
      .innerJoin("songs as s", (join) => join.onRef("s.id", "=", "a.songId").onRef("s.churchId", "=", "a.churchId"));
  }

  public async loadBySongDetailId(churchId: string, songDetailId: string) {
    return this.withLiveSong().selectAll("a").where("a.churchId", "=", churchId).where("a.songDetailId", "=", songDetailId).execute();
  }

  public async loadByFreeShowId(churchId: string, freeShowId: string) {
    return (await this.withLiveSong().selectAll("a").where("a.churchId", "=", churchId).where("a.freeShowId", "=", freeShowId).executeTakeFirst()) ?? null;
  }

  public async loadFreeShowIds(churchId: string): Promise<string[]> {
    const rows = await this.withLiveSong().select(["a.freeShowId"]).where("a.churchId", "=", churchId).where("a.freeShowId", "is not", null).execute();
    return rows.map((r) => r.freeShowId).filter((id: string) => id);
  }

  public convertToModel(_churchId: string, data: Arrangement) { return data; }
  public convertAllToModel(_churchId: string, data: Arrangement[]) { return data || []; }

  protected rowToModel(row: Arrangement): Arrangement {
    return {
      id: row.id,
      churchId: row.churchId,
      songId: row.songId,
      songDetailId: row.songDetailId,
      name: row.name,
      lyrics: row.lyrics,
      bpm: row.bpm,
      seconds: row.seconds,
      meter: row.meter,
      sequence: row.sequence,
      freeShowId: row.freeShowId
    };
  }
}
