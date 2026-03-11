import { injectable } from "inversify";
import { eq, and, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { planTypes } from "../../../db/schema/doing.js";

@injectable()
export class PlanTypeRepo extends DrizzleRepo<typeof planTypes> {
  protected readonly table = planTypes;
  protected readonly moduleName = "doing";

  public loadByIds(churchId: string, ids: string[]) {
    return this.db.select().from(planTypes).where(and(eq(planTypes.churchId, churchId), inArray(planTypes.id, ids)));
  }

  public loadByMinistryId(churchId: string, ministryId: string) {
    return this.db.select().from(planTypes).where(and(eq(planTypes.churchId, churchId), eq(planTypes.ministryId, ministryId)));
  }
}
