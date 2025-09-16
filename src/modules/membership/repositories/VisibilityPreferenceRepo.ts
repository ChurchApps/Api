import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { VisibilityPreference } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class VisibilityPreferenceRepo extends ConfiguredRepo<VisibilityPreference> {
  protected get repoConfig(): RepoConfig<VisibilityPreference> {
    return {
      tableName: "visibilityPreferences",
      hasSoftDelete: false,
      columns: ["personId", "address", "phoneNumber", "email"]
    };
  }

  public async loadForPerson(churchId: string, personId: string) {
    const sql = "SELECT * FROM visibilityPreferences WHERE churchId=? AND personId=?;";
    return TypedDB.query(sql, [churchId, personId]);
  }

  protected rowToModel(row: any): VisibilityPreference {
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      address: row.address,
      phoneNumber: row.phoneNumber,
      email: row.email
    };
  }
}
