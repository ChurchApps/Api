import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Song } from "../models/index.js";

@injectable()
export class SongRepo {
  public async save(model: Song) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Song): Promise<Song> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("songs").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      dateAdded: model.dateAdded
    } as any).execute();
    return model;
  }

  private async update(model: Song): Promise<Song> {
    await getDb().updateTable("songs").set({
      name: model.name,
      dateAdded: model.dateAdded
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("songs").where("churchId", "=", churchId).where("id", "=", id).execute();
  }

  public async load(churchId: string, id: string): Promise<Song | undefined> {
    return (await getDb().selectFrom("songs").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Song[]> {
    return getDb().selectFrom("songs").selectAll().where("churchId", "=", churchId).orderBy("name").execute() as any;
  }

  public async search(churchId: string, query: string) {
    const q = "%" + query.replace(/ /g, "%") + "%";
    return getDb().selectFrom("songs as s")
      .innerJoin("arrangements as a", "a.songId", "s.id")
      .innerJoin("arrangementKeys as ak", "ak.arrangementId", "a.id")
      .innerJoin("songDetails as sd", "sd.id", "a.songDetailId")
      .selectAll("sd")
      .select(["ak.id as arrangementKeyId", "ak.keySignature as arrangementKeySignature", "ak.shortDescription"])
      .where("s.churchId", "=", churchId)
      .where((eb) => eb.or([
        eb(sql`concat(sd.title, ' ', sd.artist)`, "like", q),
        eb(sql`concat(sd.artist, ' ', sd.title)`, "like", q)
      ]))
      .execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as Song; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Song[]; }

  protected rowToModel(row: any): Song {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      dateAdded: row.dateAdded
    };
  }
}
