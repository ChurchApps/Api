import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Song } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class SongRepository extends ConfiguredRepository<Song> {
  protected get repoConfig(): RepoConfig<Song> {
    return {
      tableName: "songs",
      hasSoftDelete: false,
      insertColumns: ["name", "dateAdded"],
      updateColumns: ["name", "dateAdded"]
    };
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM songs WHERE churchId=? AND id=?;", [churchId, id]);
  }

  public async loadAll(churchId: string): Promise<Song[]> {
    return TypedDB.query("SELECT * FROM songs WHERE churchId=? ORDER BY name;", [churchId]);
  }

  public async load(churchId: string, id: string): Promise<Song> {
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

  protected rowToModel(row: any): Song {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      dateAdded: row.dateAdded
    };
  }
}
