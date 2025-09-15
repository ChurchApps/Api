import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Time } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class TimeRepository extends ConfiguredRepository<Time> {
  protected get repoConfig(): RepoConfig<Time> {
    return {
      tableName: "times",
      hasSoftDelete: false,
      insertColumns: ["planId", "displayName", "startTime", "endTime", "teams"],
      updateColumns: ["planId", "displayName", "startTime", "endTime", "teams"]
    };
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return DB.query("DELETE FROM times WHERE churchId=? and planId=?;", [churchId, planId]);
  }

  public loadByPlanId(churchId: string, planId: string) {
    return DB.query("SELECT * FROM times WHERE churchId=? AND planId=?;", [churchId, planId]);
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return DB.query("SELECT * FROM times WHERE churchId=? and planId in (?);", [churchId, planIds]);
  }
}
