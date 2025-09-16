import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Arrangement } from "../models";

@injectable()
export class ArrangementRepository {
  public saveAll(arrangements: Arrangement[]) {
    const promises: Promise<Arrangement>[] = [];
    arrangements.forEach((sd) => {
      promises.push(this.save(sd));
    });
    return Promise.all(promises);
  }

  public save(arrangement: Arrangement) {
    return arrangement.id ? this.update(arrangement) : this.create(arrangement);
  }

  private async create(arrangement: Arrangement) {
    arrangement.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO arrangements (id, churchId, songId, songDetailId, name, lyrics, freeShowId) VALUES (?, ?, ?, ?, ?, ?, ?);";
    const params = [arrangement.id, arrangement.churchId, arrangement.songId, arrangement.songDetailId, arrangement.name, arrangement.lyrics, arrangement.freeShowId];
    await TypedDB.query(sql, params);
    return arrangement;
  }

  private async update(arrangement: Arrangement) {
    const sql = "UPDATE arrangements SET songId=?, songDetailId=?, name=?, lyrics=?, freeShowId=? WHERE id=? and churchId=?";
    const params = [arrangement.songId, arrangement.songDetailId, arrangement.name, arrangement.lyrics, arrangement.freeShowId, arrangement.id, arrangement.churchId];
    await TypedDB.query(sql, params);
    return arrangement;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM arrangements WHERE id=? and churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM arrangements WHERE churchId=? ORDER BY name;", [churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM arrangements WHERE id=? AND churchId=?;", [id, churchId]) as Promise<Arrangement | null>;
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
}
