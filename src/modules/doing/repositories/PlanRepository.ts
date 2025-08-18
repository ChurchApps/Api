import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { injectable } from "inversify";
import { Plan } from "../models";

@injectable()
export class PlanRepository {
  public save(plan: Plan) {
    return plan.id ? this.update(plan) : this.create(plan);
  }

  private async create(plan: Plan) {
    plan.id = UniqueIdHelper.shortId();

    const sql =
      "INSERT INTO plans (id, churchId, ministryId, planTypeId, name, serviceDate, notes, serviceOrder, contentType, contentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      plan.id,
      plan.churchId,
      plan.ministryId,
      plan.planTypeId,
      plan.name,
      plan.serviceDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      plan.notes,
      plan.serviceOrder,
      plan.contentType,
      plan.contentId
    ];
    await DB.query(sql, params);
    return plan;
  }

  private async update(plan: Plan) {
    const sql =
      "UPDATE plans SET ministryId=?, planTypeId=?, name=?, serviceDate=?, notes=?, serviceOrder=?, contentType=?, contentId=? WHERE id=? and churchId=?";
    const params = [
      plan.ministryId,
      plan.planTypeId,
      plan.name,
      plan.serviceDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      plan.notes,
      plan.serviceOrder,
      plan.contentType,
      plan.contentId,
      plan.id,
      plan.churchId
    ];
    await DB.query(sql, params);
    return plan;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM plans WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM plans WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM plans WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM plans WHERE churchId=? order by serviceDate desc;", [churchId]);
  }

  public load7Days(churchId: string) {
    return DB.query(
      "SELECT * FROM plans WHERE churchId=? AND serviceDate BETWEEN CURDATE() AND (CURDATE() + INTERVAL 7 DAY) order by serviceDate desc;",
      [churchId]
    );
  }

  public loadByPlanTypeId(churchId: string, planTypeId: string) {
    return DB.query("SELECT * FROM plans WHERE churchId=? AND planTypeId=? order by serviceDate desc;", [
      churchId,
      planTypeId
    ]);
  }
}
