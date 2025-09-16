import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Arrangement } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class ArrangementRepo extends ConfiguredRepo<Arrangement> {
  protected get repoConfig(): RepoConfig<Arrangement> {
    return {
      tableName: "arrangements",
      hasSoftDelete: false,
      defaultOrderBy: "name",
      columns: ["songId", "songDetailId", "name", "lyrics", "freeShowId"]
    };
  }

  public loadBySongId(churchId: string, songId: string) {
    return TypedDB.query("SELECT * FROM arrangements where churchId=? and songId=?;", [churchId, songId]) as Promise<Arrangement[]>;
  }

  public loadBySongDetailId(churchId: string, songDetailId: string) {
    return TypedDB.query("SELECT * FROM arrangements where churchId=? and songDetailId=?;", [churchId, songDetailId]);
  }

  public loadByFreeShowId(churchId: string, freeShowId: string) {
    return TypedDB.queryOne("SELECT * FROM arrangements where churchId=? and freeShowId=?;", [churchId, freeShowId]);
  }

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
