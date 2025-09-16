import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Position } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class PositionRepository extends ConfiguredRepository<Position> {
  protected get repoConfig(): RepoConfig<Position> {
    return {
      tableName: "positions",
      hasSoftDelete: false,
      insertColumns: ["planId", "categoryName", "name", "count", "groupId"],
      updateColumns: ["planId", "categoryName", "name", "count", "groupId"]
    };
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return DB.query("DELETE FROM positions WHERE churchId=? and planId=?;", [churchId, planId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM positions WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadByPlanId(churchId: string, planId: string) {
    return DB.query("SELECT * FROM positions WHERE churchId=? AND planId=? ORDER BY categoryName, name;", [churchId, planId]);
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return DB.query("SELECT * FROM positions WHERE churchId=? AND planId in (?);", [churchId, planIds]);
  }

  protected rowToModel(row: any): Position {
    return {
      id: row.id,
      churchId: row.churchId,
      planId: row.planId,
      categoryName: row.categoryName,
      name: row.name,
      count: row.count,
      groupId: row.groupId
    };
  }
}
