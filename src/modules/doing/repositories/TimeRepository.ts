import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Time } from "../models";

@injectable()
export class TimeRepository {
  public save(time: Time) {
    return time.id ? this.update(time) : this.create(time);
  }

  private async create(time: Time) {
    time.id = UniqueIdHelper.shortId();
    const sql =
      "INSERT INTO times (id, churchId, planId, displayName, startTime, endTime, teams) VALUES (?, ?, ?, ?, ?, ?, ?);";
    const params = [time.id, time.churchId, time.planId, time.displayName, time.startTime, time.endTime, time.teams];
    await DB.query(sql, params);
    return time;
  }

  private async update(time: Time) {
    const sql = "UPDATE times SET planId=?, displayName=?, startTime=?, endTime=?, teams=? WHERE id=? and churchId=?";
    const params = [time.planId, time.displayName, time.startTime, time.endTime, time.teams, time.id, time.churchId];
    await DB.query(sql, params);
    return time;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM times WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return DB.query("DELETE FROM times WHERE churchId=? and planId=?;", [churchId, planId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM times WHERE churchId=?;", [churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM times WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByPlanId(churchId: string, planId: string) {
    return DB.query("SELECT * FROM times WHERE churchId=? AND planId=?;", [churchId, planId]);
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return DB.query("SELECT * FROM times WHERE churchId=? and planId in (?);", [churchId, planIds]);
  }
}
