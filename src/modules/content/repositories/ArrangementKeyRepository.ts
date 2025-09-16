import { injectable } from "inversify";
import { TypedDB } from "../helpers";
import { ArrangementKey } from "../models";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class ArrangementKeyRepository extends ConfiguredRepository<ArrangementKey> {
  public constructor() {
    super("arrangementKeys", [
      { name: "id", type: "string", primaryKey: true },
      { name: "churchId", type: "string" },
      { name: "arrangementId", type: "string" },
      { name: "keySignature", type: "string" },
      { name: "shortDescription", type: "string" }
    ]);
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
}
