import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { SongDetail } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { UniqueIdHelper } from "@churchapps/apihelper";

@injectable()
export class SongDetailRepo extends ConfiguredRepo<SongDetail> {
  protected churchIdColumn = "";

  protected get repoConfig(): RepoConfig<SongDetail> {
    return {
      tableName: "songDetails",
      hasSoftDelete: false,
      columns: [
        "praiseChartsId", "title", "artist", "album", "language", "thumbnail", "releaseDate", "bpm", "keySignature", "seconds", "meter", "tones"
      ]
    };
  }

  // SongDetails is a global table (no churchId), so override standard methods
  public async delete(_churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM songDetails WHERE id=?;", [id]);
  }

  public async load(_churchId: string, id: string): Promise<SongDetail> {
    return TypedDB.queryOne("SELECT * FROM songDetails WHERE id=?;", [id]);
  }

  public async loadAll(_churchId: string): Promise<SongDetail[]> {
    return TypedDB.query("SELECT * FROM songDetails ORDER BY title, artist;", []);
  }

  // Global methods without churchId (for global song details)
  public loadGlobal(id: string) {
    return TypedDB.queryOne("SELECT * FROM songDetails WHERE id=?;", [id]);
  }

  public deleteGlobal(id: string) {
    return TypedDB.query("DELETE FROM songDetails WHERE id=?;", [id]);
  }

  public search(query: string) {
    const q = "%" + query.replace(/ /g, "%") + "%";
    return TypedDB.query("SELECT * FROM songDetails where title + ' ' + artist like ? or artist + ' ' + title like ?;", [q, q]);
  }

  public loadByPraiseChartsId(praiseChartsId: string) {
    return TypedDB.queryOne("SELECT * FROM songDetails where praiseChartsId=?;", [praiseChartsId]);
  }

  public loadForChurch(churchId: string) {
    const sql =
      "SELECT sd.*, s.Id as songId, s.churchId" +
      " FROM songs s" +
      " INNER JOIN arrangements a on a.songId=s.id" +
      " INNER JOIN songDetails sd on sd.id=a.songDetailId" +
      " WHERE s.churchId=?" +
      " ORDER BY sd.title, sd.artist;";
    return TypedDB.query(sql, [churchId]);
  }

  protected async create(songDetail: SongDetail) {
    songDetail.id = UniqueIdHelper.shortId();
    const sql =
      "INSERT INTO songDetails (id, praiseChartsId, title, artist, album, language, thumbnail, releaseDate, bpm, keySignature, seconds, meter, tones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      songDetail.id,
      songDetail.praiseChartsId,
      songDetail.title,
      songDetail.artist,
      songDetail.album,
      songDetail.language,
      songDetail.thumbnail,
      songDetail.releaseDate,
      songDetail.bpm,
      songDetail.keySignature,
      songDetail.seconds,
      songDetail.meter,
      songDetail.tones
    ];
    await TypedDB.query(sql, params);
    return songDetail;
  }

  protected async update(songDetail: SongDetail) {
    const sql =
      "UPDATE songDetails SET praiseChartsId=?, title=?, artist=?, album=?, language=?, thumbnail=?, releaseDate=?, bpm=?, keySignature=?, seconds=?, meter=?, tones=? WHERE id=?";
    const params = [
      songDetail.praiseChartsId,
      songDetail.title,
      songDetail.artist,
      songDetail.album,
      songDetail.language,
      songDetail.thumbnail,
      songDetail.releaseDate,
      songDetail.bpm,
      songDetail.keySignature,
      songDetail.seconds,
      songDetail.meter,
      songDetail.tones,
      songDetail.id
    ];
    await TypedDB.query(sql, params);
    return songDetail;
  }

  public save(songDetail: SongDetail) {
    return songDetail.id ? this.update(songDetail) : this.create(songDetail);
  }

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
