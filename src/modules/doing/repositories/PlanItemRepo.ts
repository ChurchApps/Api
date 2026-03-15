import { injectable } from "inversify";
import { eq, and, inArray, asc } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { planItems } from "../../../db/schema/doing.js";

@injectable()
export class PlanItemRepo extends DrizzleRepo<typeof planItems> {
  protected readonly table = planItems;
  protected readonly moduleName = "doing";

  public deleteByPlanId(churchId: string, planId: string) {
    return this.db.delete(planItems).where(and(eq(planItems.churchId, churchId), eq(planItems.planId, planId)));
  }

  public loadByIds(churchId: string, ids: string[]) {
    return this.db.select().from(planItems).where(and(eq(planItems.churchId, churchId), inArray(planItems.id, ids)));
  }

  public loadForPlan(churchId: string, planId: string) {
    return this.db.select().from(planItems).where(and(eq(planItems.churchId, churchId), eq(planItems.planId, planId))).orderBy(asc(planItems.sort));
  }
}
