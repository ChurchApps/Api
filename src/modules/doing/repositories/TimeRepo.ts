import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Time } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class TimeRepo extends ConfiguredRepo<Time> {
  protected get repoConfig(): RepoConfig<Time> {
    return {
      tableName: "times",
      hasSoftDelete: false,
      columns: ["planId", "displayName", "startTime", "endTime", "teams"]
    };
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return TypedDB.query("DELETE FROM times WHERE churchId=? and planId=?;", [churchId, planId]);
  }

  public loadByPlanId(churchId: string, planId: string) {
    return TypedDB.query("SELECT * FROM times WHERE churchId=? AND planId=?;", [churchId, planId]);
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return TypedDB.query("SELECT * FROM times WHERE churchId=? and planId in (?);", [churchId, planIds]);
  }
}
