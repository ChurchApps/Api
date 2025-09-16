import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { VisibilityPreference } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class VisibilityPreferenceRepository extends ConfiguredRepository<VisibilityPreference> {
  protected get repoConfig(): RepoConfig<VisibilityPreference> {
    return {
      tableName: "visibilityPreferences",
      hasSoftDelete: false,
      insertColumns: ["personId", "address", "phoneNumber", "email"],
      updateColumns: ["personId", "address", "phoneNumber", "email"]
    };
  }

  public async loadForPerson(churchId: string, personId: string) {
    const sql = "SELECT * FROM visibilityPreferences WHERE churchId=? AND personId=?;";
    return DB.query(sql, [churchId, personId]);
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
