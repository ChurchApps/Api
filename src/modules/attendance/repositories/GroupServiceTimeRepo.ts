import { injectable } from "inversify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { groupServiceTimes } from "../../../db/schema/attendance.js";
import { GroupServiceTime } from "../models/index.js";

@injectable()
export class GroupServiceTimeRepo extends DrizzleRepo<typeof groupServiceTimes> {
  protected readonly table = groupServiceTimes;
  protected readonly moduleName = "attendance";

  public async loadWithServiceNames(churchId: string, groupId: string) {
    const rows = await this.executeRows(sql`
      SELECT gst.*, concat(c.name, ' - ', s.name, ' - ', st.name) as serviceTimeName
      FROM groupServiceTimes gst
      INNER JOIN serviceTimes st ON st.id = gst.serviceTimeId
      INNER JOIN services s ON s.id = st.serviceId
      INNER JOIN campuses c ON c.id = s.campusId
      WHERE gst.churchId = ${churchId} AND gst.groupId = ${groupId}
    `);
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
