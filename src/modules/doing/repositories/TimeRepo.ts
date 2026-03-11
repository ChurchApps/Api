import { injectable } from "inversify";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { times } from "../../../db/schema/doing.js";

@injectable()
export class TimeRepo extends DrizzleRepo<typeof times> {
  protected readonly table = times;
  protected readonly moduleName = "doing";

  public deleteByPlanId(churchId: string, planId: string) {
    return this.db.delete(times).where(and(eq(times.churchId, churchId), eq(times.planId, planId)));
  }

  public loadByPlanId(churchId: string, planId: string) {
    return this.db.select().from(times).where(and(eq(times.churchId, churchId), eq(times.planId, planId)));
  }

  public loadByPlanIds(churchId: string, planIds: string[]) {
    return this.db.select().from(times).where(and(eq(times.churchId, churchId), inArray(times.planId, planIds)));
  }
}
