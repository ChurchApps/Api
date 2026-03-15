import { injectable } from "inversify";
import { eq, and, inArray, sql, gte, lt, between, count } from "drizzle-orm";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { assignments, positions, plans } from "../../../db/schema/doing.js";

@injectable()
export class AssignmentRepo extends DrizzleRepo<typeof assignments> {
  protected readonly table = assignments;
  protected readonly moduleName = "doing";

  public deleteByPlanId(churchId: string, planId: string) {
    const positionIds = this.db.select({ id: positions.id }).from(positions).where(eq(positions.planId, planId));
    return this.db.delete(assignments).where(and(eq(assignments.churchId, churchId), inArray(assignments.positionId, positionIds)));
  }

  public async loadByPlanId(churchId: string, planId: string): Promise<any[]> {
    const result = await this.db.select({ assignments })
      .from(assignments)
      .innerJoin(positions, eq(positions.id, assignments.positionId))
      .where(and(eq(assignments.churchId, churchId), eq(positions.planId, planId)));
    return result.map(r => r.assignments);
  }

  public async loadByPlanIds(churchId: string, planIds: string[]) {
    const result = await this.db.select({ assignments })
      .from(assignments)
      .innerJoin(positions, eq(positions.id, assignments.positionId))
      .where(and(eq(assignments.churchId, churchId), inArray(positions.planId, planIds)));
    return result.map(r => r.assignments);
  }

  public async loadLastServed(churchId: string) {
    return this.db.select({
      personId: assignments.personId,
      serviceDate: sql<Date>`max(${plans.serviceDate})`.as("serviceDate")
    })
      .from(assignments)
      .innerJoin(positions, eq(positions.id, assignments.positionId))
      .innerJoin(plans, eq(plans.id, positions.planId))
      .where(eq(assignments.churchId, churchId))
      .groupBy(assignments.personId)
      .orderBy(sql`max(${plans.serviceDate})`);
  }

  public loadByByPersonId(churchId: string, personId: string) {
    return this.db.select().from(assignments).where(and(eq(assignments.churchId, churchId), eq(assignments.personId, personId)));
  }

  public async loadUnconfirmedByServiceDateRange(churchId?: string) {
    const twoDaysFromNow = DateHelper.daysFromNow(2);
    const threeDaysFromNow = DateHelper.daysFromNow(3);

    const conditions = [
      eq(assignments.status, "Unconfirmed"),
      gte(plans.serviceDate, twoDaysFromNow),
      lt(plans.serviceDate, threeDaysFromNow)
    ];
    if (churchId) conditions.push(eq(assignments.churchId, churchId));

    const result = await this.db.select({
      assignments,
      serviceDate: plans.serviceDate,
      planName: plans.name
    })
      .from(assignments)
      .innerJoin(positions, eq(positions.id, assignments.positionId))
      .innerJoin(plans, eq(plans.id, positions.planId))
      .where(and(...conditions));
    return result.map(r => ({ ...r.assignments, serviceDate: r.serviceDate, planName: r.planName }));
  }

  public async countByPositionId(churchId: string, positionId: string) {
    const result = await this.db.select({ cnt: count() })
      .from(assignments)
      .where(and(eq(assignments.churchId, churchId), eq(assignments.positionId, positionId), inArray(assignments.status, ["Accepted", "Unconfirmed"])));
    return result[0];
  }

  public async loadByServiceDate(churchId: string, serviceDate: Date, excludePlanId?: string) {
    const startOfDay = new Date(serviceDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(serviceDate);
    endOfDay.setHours(23, 59, 59, 999);

    const conditions = [
      eq(assignments.churchId, churchId),
      between(plans.serviceDate, startOfDay, endOfDay)
    ];
    if (excludePlanId) conditions.push(sql`${plans.id} != ${excludePlanId}`);

    const result = await this.db.select({ assignments })
      .from(assignments)
      .innerJoin(positions, eq(positions.id, assignments.positionId))
      .innerJoin(plans, eq(plans.id, positions.planId))
      .where(and(...conditions));
    return result.map(r => r.assignments);
  }
}
