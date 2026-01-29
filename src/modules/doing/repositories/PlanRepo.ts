import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { injectable } from "inversify";
import { Plan } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class PlanRepo extends ConfiguredRepo<Plan> {
  protected get repoConfig(): RepoConfig<Plan> {
    return {
      tableName: "plans",
      hasSoftDelete: false,
      columns: ["ministryId", "planTypeId", "name", "serviceDate", "notes", "serviceOrder", "contentType", "contentId", "providerId", "providerPlanId", "providerPlanName"]
    };
  }

  protected async create(plan: Plan): Promise<Plan> {
    if (!plan.id) plan.id = this.createId();

    const sql = "INSERT INTO plans (id, churchId, ministryId, planTypeId, name, serviceDate, notes, serviceOrder, contentType, contentId, providerId, providerPlanId, providerPlanName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
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
      plan.contentId,
      plan.providerId,
      plan.providerPlanId,
      plan.providerPlanName
    ];
    await TypedDB.query(sql, params);
    return plan;
  }

  protected async update(plan: Plan): Promise<Plan> {
    const sql = "UPDATE plans SET ministryId=?, planTypeId=?, name=?, serviceDate=?, notes=?, serviceOrder=?, contentType=?, contentId=?, providerId=?, providerPlanId=?, providerPlanName=? WHERE id=? and churchId=?";
    const params = [
      plan.ministryId,
      plan.planTypeId,
      plan.name,
      plan.serviceDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
      plan.notes,
      plan.serviceOrder,
      plan.contentType,
      plan.contentId,
      plan.providerId,
      plan.providerPlanId,
      plan.providerPlanName,
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

  public loadCurrentByPlanTypeId(planTypeId: string) {
    return TypedDB.queryOne(
      "SELECT * FROM plans WHERE planTypeId=? AND serviceDate>=CURDATE() ORDER by serviceDate LIMIT 1",
      [planTypeId]
    );
  }
}
