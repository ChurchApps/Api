import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { SongDetail } from "../models";

@injectable()
export class SongDetailRepository {
  public saveAll(songDetails: SongDetail[]) {
    const promises: Promise<SongDetail>[] = [];
    songDetails.forEach((sd) => {
      promises.push(this.save(sd));
    });
    return Promise.all(promises);
  }

  public save(songDetail: SongDetail) {
    return songDetail.id ? this.update(songDetail) : this.create(songDetail);
  }

  private async create(songDetail: SongDetail) {
    songDetail.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO songDetails (id, praiseChartsId, title, artist, album, language, thumbnail, releaseDate, bpm, keySignature, seconds, meter, tones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
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

  private async update(songDetail: SongDetail) {
    const sql = "UPDATE songDetails SET praiseChartsId=?, title=?, artist=?, album=?, language=?, thumbnail=?, releaseDate=?, bpm=?, keySignature=?, seconds=?, meter=?, tones=? WHERE id=?";
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

  public delete(id: string) {
    return TypedDB.query("DELETE FROM songDetails WHERE id=?;", [id]);
  }

  public load(id: string) {
    return TypedDB.queryOne("SELECT * FROM songDetails WHERE id=?;", [id]);
  }

  public search(query: string) {
    const q = "%" + query.replace(/ /g, "%") + "%";
    return TypedDB.query("SELECT * FROM songDetails where title + ' ' + artist like ? or artist + ' ' + title like ?;", [q, q]);
  }

  public loadByPraiseChartsId(praiseChartsId: string) {
    return TypedDB.queryOne("SELECT * FROM songDetails where praiseChartsId=?;", [praiseChartsId]);
  }

  public loadForChurch(churchId: string) {
    const sql = "SELECT sd.*, s.Id as songId, s.churchId" + " FROM songs s" + " INNER JOIN arrangements a on a.songId=s.id" + " INNER JOIN songDetails sd on sd.id=a.songDetailId" + " WHERE s.churchId=?" + " ORDER BY sd.title, sd.artist;";
    return TypedDB.query(sql, [churchId]);
  }
}
