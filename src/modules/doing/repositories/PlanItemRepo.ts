import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { injectable } from "inversify";
import { PlanItem } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class PlanItemRepo extends ConfiguredRepo<PlanItem> {
  protected get repoConfig(): RepoConfig<PlanItem> {
    return {
      tableName: "planItems",
      hasSoftDelete: false,
      columns: [
        "planId", "parentId", "sort", "itemType", "relatedId", "label", "description", "seconds", "link", "providerId", "providerPath", "providerContentPath", "thumbnailUrl"
      ]
    };
  }

  public deleteByPlanId(churchId: string, planId: string) {
    return TypedDB.query("DELETE FROM planItems WHERE churchId=? and planId=?;", [churchId, planId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return TypedDB.query("SELECT * FROM planItems WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadForPlan(churchId: string, planId: string) {
    return TypedDB.query("SELECT * FROM planItems WHERE churchId=? and planId=? ORDER BY sort", [churchId, planId]);
  }
}
