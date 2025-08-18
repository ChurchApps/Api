import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Action } from "../models";

@injectable()
export class ActionRepository {
  public save(action: Action) {
    return action.id ? this.update(action) : this.create(action);
  }

  private async create(action: Action) {
    action.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO actions (id, churchId, automationId, actionType, actionData) VALUES (?, ?, ?, ?, ?);";
    const params = [action.id, action.churchId, action.automationId, action.actionType, action.actionData];
    await DB.query(sql, params);
    return action;
  }

  private async update(action: Action) {
    const sql = "UPDATE actions SET automationId=?, actionType=?, actionData=? WHERE id=? and churchId=?";
    const params = [action.automationId, action.actionType, action.actionData, action.id, action.churchId];
    await DB.query(sql, params);
    return action;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM actions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM actions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadForAutomation(churchId: string, automationId: string) {
    return DB.query("SELECT * FROM actions WHERE automationId=? AND churchId=?;", [automationId, churchId]);
  }
}
