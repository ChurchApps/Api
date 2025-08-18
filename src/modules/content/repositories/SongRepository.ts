import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { Song } from "../models";

@injectable()
export class SongRepository {
  public saveAll(songs: Song[]) {
    const promises: Promise<Song>[] = [];
    songs.forEach((sd) => {
      promises.push(this.save(sd));
    });
    return Promise.all(promises);
  }

  public save(song: Song) {
    return song.id ? this.update(song) : this.create(song);
  }

  private async create(song: Song) {
    song.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO songs (id, churchId, name, dateAdded) VALUES (?, ?, ?, ?);";
    const params = [song.id, song.churchId, song.name, song.dateAdded];
    await TypedDB.query(sql, params);
    return song;
  }

  private async update(song: Song) {
    const sql = "UPDATE songs SET name=?, dateAdded=? WHERE id=? and churchId=?";
    const params = [song.name, song.dateAdded, song.id, song.churchId];
    await TypedDB.query(sql, params);
    return song;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM songs WHERE churchId=? AND id=?;", [churchId, id]);
  }

  public loadAll(churchId: string) {
    return TypedDB.queryOne("SELECT * FROM songs WHERE churchId=? ORDER BY title;", [churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM songs WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public search(churchId: string, query: string) {
    const q = "%" + query.replace(/ /g, "%") + "%";
    const sql =
      "SELECT sd.*, ak.id as arrangementKeyId, ak.keySignature as arrangementKeySignature, ak.shortDescription FROM songs s" +
      " INNER JOIN arrangements a on a.songId=s.id" +
      " INNER JOIN arrangementKeys ak on ak.arrangementId=a.id" +
      " INNER JOIN songDetails sd on sd.id=a.songDetailId" +
      " where s.churchId=? AND (concat(sd.title, ' ', sd.artist) like ? or concat(sd.artist, ' ', sd.title) like ?);";
    return TypedDB.query(sql, [churchId, q, q]);
  }
}
