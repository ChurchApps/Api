import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { ArrangementKey } from "../models";

@injectable()
export class ArrangementKeyRepository {
  public saveAll(arrangementKeys: ArrangementKey[]) {
    const promises: Promise<ArrangementKey>[] = [];
    arrangementKeys.forEach((sd) => {
      promises.push(this.save(sd));
    });
    return Promise.all(promises);
  }

  public save(arrangementKey: ArrangementKey) {
    return arrangementKey.id ? this.update(arrangementKey) : this.create(arrangementKey);
  }

  private async create(arrangementKey: ArrangementKey) {
    arrangementKey.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO arrangementKeys (id, churchId, arrangementId, keySignature, shortDescription) VALUES (?, ?, ?, ?, ?);";
    const params = [arrangementKey.id, arrangementKey.churchId, arrangementKey.arrangementId, arrangementKey.keySignature, arrangementKey.shortDescription];
    await TypedDB.query(sql, params);
    return arrangementKey;
  }

  private async update(arrangementKey: ArrangementKey) {
    const sql = "UPDATE arrangementKeys SET arrangementId=?, keySignature=?, shortDescription=? WHERE id=? and churchId=?";
    const params = [arrangementKey.arrangementId, arrangementKey.keySignature, arrangementKey.shortDescription, arrangementKey.id, arrangementKey.churchId];
    await TypedDB.query(sql, params);
    return arrangementKey;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM arrangementKeys WHERE id=? and churchId=?;", [id, churchId]);
  }

  public deleteForArrangement(churchId: string, arrangementId: string) {
    return TypedDB.query("DELETE FROM arrangementKeys WHERE churchId=? and arrangementId=?;", [churchId, arrangementId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.queryOne("SELECT * FROM arrangementKeys WHERE churchId=? ORDER BY name;", [churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM arrangementKeys WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByArrangementId(churchId: string, arrangementId: string) {
    return TypedDB.query("SELECT * FROM arrangementKeys where churchId=? and arrangementId=?;", [churchId, arrangementId]);
  }
}
