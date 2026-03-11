import { injectable } from "inversify";
import { eq, and, inArray, desc, asc, gte, between, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { plans, positions } from "../../../db/schema/doing.js";
import { Plan } from "../models/index.js";

@injectable()
export class PlanRepo extends DrizzleRepo<typeof plans> {
  protected readonly table = plans;
  protected readonly moduleName = "doing";

  public override async save(model: Plan) {
    const data = { ...model } as any;
    data.serviceDate = DateHelper.toMysqlDateOnly(data.serviceDate) || new Date().toISOString().split("T")[0];

    if (data.id) {
      await this.db.update(plans).set(data).where(and(eq(plans.id, data.id), eq(plans.churchId, data.churchId)));
    } else {
      data.id = UniqueIdHelper.shortId();
      await this.db.insert(plans).values(data);
    }
    return data as Plan;
  }

  public loadByIds(churchId: string, ids: string[]) {
    return this.db.select().from(plans).where(and(eq(plans.churchId, churchId), inArray(plans.id, ids)));
  }

  public load7Days(churchId: string) {
    return this.db.select().from(plans)
      .where(and(eq(plans.churchId, churchId), between(plans.serviceDate, sql`CURDATE()`, sql`CURDATE() + INTERVAL 7 DAY`)))
      .orderBy(desc(plans.serviceDate));
  }

  public loadByPlanTypeId(churchId: string, planTypeId: string) {
    return this.db.select().from(plans)
      .where(and(eq(plans.churchId, churchId), eq(plans.planTypeId, planTypeId)))
      .orderBy(desc(plans.serviceDate));
  }

  public loadCurrentByPlanTypeId(planTypeId: string) {
    return this.db.select().from(plans)
      .where(and(eq(plans.planTypeId, planTypeId), gte(plans.serviceDate, sql`CURDATE()`)))
      .orderBy(asc(plans.serviceDate))
      .limit(1)
      .then(r => r[0] ?? null);
  }

  public async loadSignupPlans(churchId: string) {
    const result = await this.db.selectDistinct({ plans })
      .from(plans)
      .innerJoin(positions, and(eq(positions.planId, plans.id), eq(positions.churchId, plans.churchId)))
      .where(and(eq(plans.churchId, churchId), eq(positions.allowSelfSignup, true), gte(plans.serviceDate, sql`CURDATE()`)))
      .orderBy(asc(plans.serviceDate));
    return result.map(r => r.plans);
  }
}
