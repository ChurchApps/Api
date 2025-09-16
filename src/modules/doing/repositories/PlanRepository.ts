import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { injectable } from "inversify";
import { Plan } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class PlanRepository extends ConfiguredRepository<Plan> {
  protected get repoConfig(): RepoConfig<Plan> {
    return {
      tableName: "plans",
      hasSoftDelete: false,
      insertColumns: ["ministryId", "planTypeId", "name", "serviceDate", "notes", "serviceOrder", "contentType", "contentId"],
      updateColumns: ["ministryId", "planTypeId", "name", "serviceDate", "notes", "serviceOrder", "contentType", "contentId"]
    };
  }

  protected async create(plan: Plan): Promise<Plan> {
    if (!plan.id) plan.id = this.createId();

    const sql = "INSERT INTO plans (id, churchId, ministryId, planTypeId, name, serviceDate, notes, serviceOrder, contentType, contentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
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
    await TypedDB.query(sql, params);
    return plan;
  }

  protected async update(plan: Plan): Promise<Plan> {
    const sql = "UPDATE plans SET ministryId=?, planTypeId=?, name=?, serviceDate=?, notes=?, serviceOrder=?, contentType=?, contentId=? WHERE id=? and churchId=?";
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
    await TypedDB.query(sql, params);
    return plan;
  }

  public loadByIds(churchId: string, ids: string[]) {
    return TypedDB.query("SELECT * FROM plans WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public load7Days(churchId: string) {
    return TypedDB.query("SELECT * FROM plans WHERE churchId=? AND serviceDate BETWEEN CURDATE() AND (CURDATE() + INTERVAL 7 DAY) order by serviceDate desc;", [churchId]);
  }

  public loadByPlanTypeId(churchId: string, planTypeId: string) {
    return TypedDB.query("SELECT * FROM plans WHERE churchId=? AND planTypeId=? order by serviceDate desc;", [churchId, planTypeId]);
  }
}
