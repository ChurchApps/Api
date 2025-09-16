import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { PlanType } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class PlanTypeRepository extends ConfiguredRepository<PlanType> {
  protected get repoConfig(): RepoConfig<PlanType> {
    return {
      tableName: "planTypes",
      hasSoftDelete: false,
      insertColumns: ["ministryId", "name"],
      updateColumns: ["ministryId", "name"]
    };
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM planTypes WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadByMinistryId(churchId: string, ministryId: string) {
    return DB.query("SELECT * FROM planTypes WHERE churchId=? AND ministryId=?;", [churchId, ministryId]);
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
