import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { SongDetailLink } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class SongDetailLinkRepo extends ConfiguredRepo<SongDetailLink> {
  protected get repoConfig(): RepoConfig<SongDetailLink> {
    return {
      tableName: "songDetailLinks",
      hasSoftDelete: false,
      columns: ["songDetailId", "service", "serviceKey", "url"]
    };
  }

  public async delete(id: string): Promise<any> {
    return TypedDB.query("DELETE FROM songDetailLinks WHERE id=?;", [id]);
  }

  public async load(id: string): Promise<SongDetailLink> {
    return TypedDB.queryOne("SELECT * FROM songDetailLinks WHERE id=?;", [id]);
  }

  public loadForSongDetail(songDetailId: string) {
    return TypedDB.query("SELECT * FROM songDetailLinks WHERE songDetailId=? ORDER BY service;", [songDetailId]);
  }

  public loadByServiceAndKey(service: string, serviceKey: string) {
    return TypedDB.queryOne("SELECT * FROM songDetailLinks WHERE service=? AND serviceKey=?;", [service, serviceKey]);
  }

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
