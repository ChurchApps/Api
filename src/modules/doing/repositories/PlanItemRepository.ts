import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { injectable } from "inversify";
import { PlanItem } from "../models";

@injectable()
export class PlanItemRepository {
  public save(planItem: PlanItem) {
    return planItem.id ? this.update(planItem) : this.create(planItem);
  }

  private async create(planItem: PlanItem) {
    planItem.id = UniqueIdHelper.shortId();

    const sql =
      "INSERT INTO planItems (id, churchId, planId, parentId, sort, itemType, relatedId, label, description, seconds, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      planItem.id,
      planItem.churchId,
      planItem.planId,
      planItem.parentId,
      planItem.sort,
      planItem.itemType,
      planItem.relatedId,
      planItem.label,
      planItem.description,
      planItem.seconds,
      planItem.link
    ];
    await DB.query(sql, params);
    return planItem;
  }

  private async update(planItem: PlanItem) {
    const sql =
      "UPDATE planItems SET planId=?, parentId=?, sort=?, itemType=?, relatedId=?, label=?, description=?, seconds=?, link=? WHERE id=? and churchId=?";
    const params = [
      planItem.planId,
      planItem.parentId,
      planItem.sort,
      planItem.itemType,
      planItem.relatedId,
      planItem.label,
      planItem.description,
      planItem.seconds,
      planItem.link,
      planItem.id,
      planItem.churchId
    ];
    await DB.query(sql, params);
    return planItem;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM planItems WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return DB.query("DELETE FROM planItems WHERE churchId=? and planId=?;", [churchId, planId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM planItems WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM planItems WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadForPlan(churchId: string, planId: string) {
    return DB.query("SELECT * FROM planItems WHERE churchId=? and planId=? ORDER BY sort", [churchId, planId]);
  }
}
