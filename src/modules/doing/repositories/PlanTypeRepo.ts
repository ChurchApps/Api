import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { PlanType } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class PlanTypeRepo extends ConfiguredRepo<PlanType> {
  protected get repoConfig(): RepoConfig<PlanType> {
    return {
      tableName: "planTypes",
      hasSoftDelete: false,
      columns: ["ministryId", "name"]
    };
  }

  public loadByIds(churchId: string, ids: string[]) {
    return TypedDB.query("SELECT * FROM planTypes WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadByMinistryId(churchId: string, ministryId: string) {
    return TypedDB.query("SELECT * FROM planTypes WHERE churchId=? AND ministryId=?;", [churchId, ministryId]);
  }

  protected rowToModel(row: any): PlanType {
    return {
      id: row.id,
      churchId: row.churchId,
      ministryId: row.ministryId,
      name: row.name
    };
  }
}
