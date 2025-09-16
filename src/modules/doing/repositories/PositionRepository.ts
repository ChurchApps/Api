import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { Position } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ConfiguredRepository } from "../../../shared/repositories/ConfiguredRepository";

@injectable()
export class PositionRepository extends ConfiguredRepository<Position> {
  public constructor() {
    super("positions", [
      { name: "id", type: "string", primaryKey: true },
      { name: "churchId", type: "string" },
      { name: "planId", type: "string" },
      { name: "categoryName", type: "string" },
      { name: "name", type: "string" },
      { name: "count", type: "number" },
      { name: "groupId", type: "string" }
    ]);
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

  public convertToModel(churchId: string, data: any): Position {
    const result: Position = {
      id: data.id,
      churchId: data.churchId,
      planId: data.planId,
      categoryName: data.categoryName,
      name: data.name,
      count: data.count,
      groupId: data.groupId
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): Position[] {
    return CollectionHelper.convertAll<Position>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
