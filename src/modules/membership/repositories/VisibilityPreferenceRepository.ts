import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { VisibilityPreference } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class VisibilityPreferenceRepository extends ConfiguredRepository<VisibilityPreference> {
  public constructor() {
    super("visibilityPreferences", [
      { name: "id", type: "string", primaryKey: true },
      { name: "churchId", type: "string" },
      { name: "personId", type: "string" },
      { name: "address", type: "boolean" },
      { name: "phoneNumber", type: "boolean" },
      { name: "email", type: "boolean" }
    ]);
  }

  public async loadForPerson(churchId: string, personId: string) {
    const sql = "SELECT * FROM visibilityPreferences WHERE churchId=? AND personId=?;";
    return DB.query(sql, [churchId, personId]);
  }

  public convertToModel(churchId: string, data: any): VisibilityPreference {
    const result: VisibilityPreference = {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      address: data.address,
      phoneNumber: data.phoneNumber,
      email: data.email
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): VisibilityPreference[] {
    return CollectionHelper.convertAll<VisibilityPreference>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
