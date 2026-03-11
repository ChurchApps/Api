import { injectable } from "inversify";
import { eq, and, inArray, sql } from "drizzle-orm";
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
    const baseQuery = this.db.select({
      assignments,
      serviceDate: plans.serviceDate,
      planName: plans.name
    })
      .from(assignments)
      .innerJoin(positions, eq(positions.id, assignments.positionId))
      .innerJoin(plans, eq(plans.id, positions.planId))
      .where(
        churchId
          ? and(
            eq(assignments.status, "Unconfirmed"),
            sql`${plans.serviceDate} >= DATE_ADD(CURDATE(), INTERVAL 2 DAY)`,
            sql`${plans.serviceDate} < DATE_ADD(CURDATE(), INTERVAL 3 DAY)`,
            eq(assignments.churchId, churchId)
          )
          : and(
            eq(assignments.status, "Unconfirmed"),
            sql`${plans.serviceDate} >= DATE_ADD(CURDATE(), INTERVAL 2 DAY)`,
            sql`${plans.serviceDate} < DATE_ADD(CURDATE(), INTERVAL 3 DAY)`
          )
      );
    const result = await baseQuery;
    return result.map(r => ({ ...r.assignments, serviceDate: r.serviceDate, planName: r.planName }));
  }

  public async countByPositionId(churchId: string, positionId: string) {
    const result = await this.db.select({ cnt: sql<number>`COUNT(*)` })
      .from(assignments)
      .where(and(eq(assignments.churchId, churchId), eq(assignments.positionId, positionId), inArray(assignments.status, ["Accepted", "Unconfirmed"])));
    return result[0];
  }

  public async loadByServiceDate(churchId: string, serviceDate: Date, excludePlanId?: string) {
    const condition = excludePlanId
      ? and(eq(assignments.churchId, churchId), sql`DATE(${plans.serviceDate}) = DATE(${serviceDate})`, sql`${plans.id} != ${excludePlanId}`)
      : and(eq(assignments.churchId, churchId), sql`DATE(${plans.serviceDate}) = DATE(${serviceDate})`);

    const result = await this.db.select({ assignments })
      .from(assignments)
      .innerJoin(positions, eq(positions.id, assignments.positionId))
      .innerJoin(plans, eq(plans.id, positions.planId))
      .where(condition);
    return result.map(r => r.assignments);
  }
}
