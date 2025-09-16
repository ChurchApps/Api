import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Position } from "../models";

import { CollectionHelper } from "../../../shared/helpers";

@injectable()
export class PositionRepository {
  public save(position: Position) {
    return position.id ? this.update(position) : this.create(position);
  }

  private async create(position: Position) {
    position.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO positions (id, churchId, planId, categoryName, name, count, groupId) VALUES (?, ?, ?, ?, ?, ?, ?);";
    const params = [position.id, position.churchId, position.planId, position.categoryName, position.name, position.count, position.groupId];
    await DB.query(sql, params);
    return position;
  }

  private async update(position: Position) {
    const sql = "UPDATE positions SET planId=?, categoryName=?, name=?, count=?, groupId=? WHERE id=? and churchId=?";
    const params = [position.planId, position.categoryName, position.name, position.count, position.groupId, position.id, position.churchId];
    await DB.query(sql, params);
    return position;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM positions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return DB.query("DELETE FROM positions WHERE churchId=? and planId=?;", [churchId, planId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM positions WHERE id=? AND churchId=?;", [id, churchId]);
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
