import { injectable } from "inversify";
import { eq, and, inArray, asc } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { positions } from "../../../db/schema/doing.js";

@injectable()
export class PositionRepo extends DrizzleRepo<typeof positions> {
  protected readonly table = positions;
  protected readonly moduleName = "doing";

  public deleteByPlanId(churchId: string, planId: string) {
    return this.db.delete(positions).where(and(eq(positions.churchId, churchId), eq(positions.planId, planId)));
  }

  public loadByIds(churchId: string, ids: string[]) {
    return this.db.select().from(positions).where(and(eq(positions.churchId, churchId), inArray(positions.id, ids)));
  }

  public loadByPlanId(churchId: string, planId: string) {
    return this.db.select().from(positions).where(and(eq(positions.churchId, churchId), eq(positions.planId, planId))).orderBy(asc(positions.categoryName), asc(positions.name));
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return this.db.select().from(positions).where(and(eq(positions.churchId, churchId), inArray(positions.planId, planIds)));
  }

  public loadSignupByPlanId(churchId: string, planId: string) {
    return this.db.select().from(positions)
      .where(and(eq(positions.churchId, churchId), eq(positions.planId, planId), eq(positions.allowSelfSignup, true)))
      .orderBy(asc(positions.categoryName), asc(positions.name));
  }
}
