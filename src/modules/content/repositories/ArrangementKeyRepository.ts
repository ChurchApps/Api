import { injectable } from "inversify";
import { TypedDB } from "../helpers";
import { ArrangementKey } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class ArrangementKeyRepository extends ConfiguredRepository<ArrangementKey> {
  protected get repoConfig(): RepoConfig<ArrangementKey> {
    return {
      tableName: "arrangementKeys",
      hasSoftDelete: false,
      insertColumns: ["arrangementId", "keySignature", "shortDescription"],
      updateColumns: ["arrangementId", "keySignature", "shortDescription"]
    };
  }

  // Override to use TypedDB instead of DB
  protected async create(model: ArrangementKey): Promise<ArrangementKey> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: ArrangementKey): Promise<ArrangementKey> {
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM arrangementKeys WHERE id=? AND churchId=?", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<ArrangementKey> {
    return TypedDB.queryOne("SELECT * FROM arrangementKeys WHERE id=? AND churchId=?", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<ArrangementKey[]> {
    return TypedDB.query("SELECT * FROM arrangementKeys WHERE churchId=?", [churchId]);
  }

  public saveAll(arrangementKeys: ArrangementKey[]) {
    const promises: Promise<ArrangementKey>[] = [];
    arrangementKeys.forEach((sd) => {
      promises.push(this.save(sd));
    });
    return Promise.all(promises);
  }

  public deleteForArrangement(churchId: string, arrangementId: string) {
    return TypedDB.query("DELETE FROM arrangementKeys WHERE churchId=? and arrangementId=?;", [churchId, arrangementId]);
  }

  public loadByArrangementId(churchId: string, arrangementId: string) {
    return TypedDB.query("SELECT * FROM arrangementKeys where churchId=? and arrangementId=?;", [churchId, arrangementId]);
  }

  protected rowToModel(row: any): ArrangementKey {
    return {
      id: row.id,
      churchId: row.churchId,
      arrangementId: row.arrangementId,
      keySignature: row.keySignature,
      shortDescription: row.shortDescription
    };
  }
}
