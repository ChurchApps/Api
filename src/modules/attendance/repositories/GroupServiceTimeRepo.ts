import { injectable } from "inversify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { groupServiceTimes, serviceTimes, services, campuses } from "../../../db/schema/attendance.js";
import { GroupServiceTime } from "../models/index.js";

@injectable()
export class GroupServiceTimeRepo extends DrizzleRepo<typeof groupServiceTimes> {
  protected readonly table = groupServiceTimes;
  protected readonly moduleName = "attendance";

  public async loadWithServiceNames(churchId: string, groupId: string) {
    const rows = await this.db.select({
      id: groupServiceTimes.id,
      churchId: groupServiceTimes.churchId,
      groupId: groupServiceTimes.groupId,
      serviceTimeId: groupServiceTimes.serviceTimeId,
      serviceTimeName: sql`concat(${campuses.name}, ' - ', ${services.name}, ' - ', ${serviceTimes.name})`.as("serviceTimeName")
    })
      .from(groupServiceTimes)
      .innerJoin(serviceTimes, eq(serviceTimes.id, groupServiceTimes.serviceTimeId))
      .innerJoin(services, eq(services.id, serviceTimes.serviceId))
      .innerJoin(campuses, eq(campuses.id, services.campusId))
      .where(and(eq(groupServiceTimes.churchId, churchId), eq(groupServiceTimes.groupId, groupId)));
    return this.convertAllToModel(churchId, rows);
  }

  public loadByServiceTimeIds(churchId: string, serviceTimeIds: string[]) {
    if (serviceTimeIds.length === 0) return Promise.resolve([]);
    return this.db.select().from(groupServiceTimes)
      .where(and(eq(groupServiceTimes.churchId, churchId), inArray(groupServiceTimes.serviceTimeId, serviceTimeIds)));
  }

  public convertToModel(_churchId: string, row: any): GroupServiceTime {
    const result: GroupServiceTime = { id: row.id, groupId: row.groupId, serviceTimeId: row.serviceTimeId };
    if (row.serviceTimeName !== undefined) result.serviceTime = { id: result.serviceTimeId, name: row.serviceTimeName };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
