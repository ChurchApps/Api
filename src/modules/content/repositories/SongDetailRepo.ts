import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { SongDetail } from "../models/index.js";

@injectable()
export class SongDetailRepo {
  public async save(model: SongDetail) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: SongDetail): Promise<SongDetail> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("songDetails").values({
      id: model.id,
      praiseChartsId: model.praiseChartsId,
      title: model.title,
      artist: model.artist,
      album: model.album,
      language: model.language,
      thumbnail: model.thumbnail,
      releaseDate: model.releaseDate,
      bpm: model.bpm,
      keySignature: model.keySignature,
      seconds: model.seconds,
      meter: model.meter,
      tones: model.tones
    } as any).execute();
    return model;
  }

  private async update(model: SongDetail): Promise<SongDetail> {
    await getDb().updateTable("songDetails").set({
      praiseChartsId: model.praiseChartsId,
      title: model.title,
      artist: model.artist,
      album: model.album,
      language: model.language,
      thumbnail: model.thumbnail,
      releaseDate: model.releaseDate,
      bpm: model.bpm,
      keySignature: model.keySignature,
      seconds: model.seconds,
      meter: model.meter,
      tones: model.tones
    } as any).where("id", "=", model.id).execute();
    return model;
  }

  // SongDetails is a global table (no churchId)
  public async delete(_churchId: string, id: string) {
    await getDb().deleteFrom("songDetails").where("id", "=", id).execute();
  }

  public async load(_churchId: string, id: string): Promise<SongDetail | undefined> {
    return (await getDb().selectFrom("songDetails").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadAll(_churchId: string): Promise<SongDetail[]> {
    return getDb().selectFrom("songDetails").selectAll().orderBy("title").orderBy("artist").execute() as any;
  }

  // Global methods without churchId
  public async loadGlobal(id: string) {
    return (await getDb().selectFrom("songDetails").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async deleteGlobal(id: string) {
    await getDb().deleteFrom("songDetails").where("id", "=", id).execute();
  }

  public async search(query: string) {
    const q = "%" + query.replace(/ /g, "%") + "%";
    const result = await sql`SELECT * FROM songDetails where title + ' ' + artist like ${q} or artist + ' ' + title like ${q}`.execute(getDb());
    return result.rows as any;
  }

  public async loadByPraiseChartsId(praiseChartsId: string): Promise<SongDetail | null> {
    return (await getDb().selectFrom("songDetails").selectAll().where("praiseChartsId", "=", praiseChartsId).executeTakeFirst()) ?? null as any;
  }

  public async loadForChurch(churchId: string) {
    const result = await sql`SELECT sd.*, s.Id as songId, s.churchId
      FROM songs s
      INNER JOIN arrangements a on a.songId=s.id
      INNER JOIN songDetails sd on sd.id=a.songDetailId
      WHERE s.churchId=${churchId}
      ORDER BY sd.title, sd.artist`.execute(getDb());
    return result.rows as any;
  }

  public convertToModel(data: any) { return data as SongDetail; }
  public convertAllToModel(data: any[]) { return (data || []) as SongDetail[]; }

  protected rowToModel(row: any): SongDetail {
    return {
      id: row.id,
      praiseChartsId: row.praiseChartsId,
      title: row.title,
      artist: row.artist,
      album: row.album,
      language: row.language,
      thumbnail: row.thumbnail,
      releaseDate: row.releaseDate,
      bpm: row.bpm,
      keySignature: row.keySignature,
      seconds: row.seconds,
      meter: row.meter,
      tones: row.tones
    };
  }
}
