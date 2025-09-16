import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
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

  public async delete(churchId: string, id: string): Promise<any> {
    return TypedDB.query("DELETE FROM arrangementKeys WHERE id=? AND churchId=?", [id, churchId]);
  }

  public async load(churchId: string, id: string): Promise<ArrangementKey> {
    return TypedDB.queryOne("SELECT * FROM arrangementKeys WHERE id=? AND churchId=?", [id, churchId]);
  }

  public async loadAll(churchId: string): Promise<ArrangementKey[]> {
    return TypedDB.query("SELECT * FROM arrangementKeys WHERE churchId=?", [churchId]);
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
