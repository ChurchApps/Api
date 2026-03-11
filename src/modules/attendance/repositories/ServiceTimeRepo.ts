import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { serviceTimes } from "../../../db/schema/attendance.js";
import { ServiceTime } from "../models/index.js";

@injectable()
export class ServiceTimeRepo extends DrizzleRepo<typeof serviceTimes> {
  protected readonly table = serviceTimes;
  protected readonly moduleName = "attendance";
  protected readonly softDelete = true;

  public override loadAll(churchId: string) {
    return this.db.select().from(serviceTimes)
      .where(and(eq(serviceTimes.churchId, churchId), eq(serviceTimes.removed, false)))
      .orderBy(serviceTimes.name);
  }

  public async loadNamesWithCampusService(churchId: string) {
    const rows = await this.executeRows(sql`
      SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName
      FROM serviceTimes st
      INNER JOIN services s ON s.id = st.serviceId
      INNER JOIN campuses c ON c.id = s.campusId
      WHERE s.churchId = ${churchId} AND st.removed = 0 AND s.removed = 0 AND c.removed = 0
      ORDER BY c.name, s.name, st.name
    `);
    return this.convertAllToModel(churchId, rows);
  }

  public async loadNamesByServiceId(churchId: string, serviceId: string) {
    const rows = await this.executeRows(sql`
      SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName
      FROM serviceTimes st
      INNER JOIN services s ON s.id = st.serviceId
      INNER JOIN campuses c ON c.id = s.campusId
      WHERE s.churchId = ${churchId} AND s.id = ${serviceId} AND st.removed = 0
      ORDER BY c.name, s.name, st.name
    `);
    return this.convertAllToModel(churchId, rows);
  }

  public async loadByChurchCampusService(churchId: string, campusId: string, serviceId: string) {
    const rows = await this.executeRows(sql`
      SELECT st.*
      FROM serviceTimes st
      LEFT OUTER JOIN services s ON s.id = st.serviceId
      WHERE st.churchId = ${churchId}
        AND (${serviceId} = '0' OR st.serviceId = ${serviceId})
        AND (${campusId} = '0' OR s.campusId = ${campusId})
        AND st.removed = 0
    `);
    return this.convertAllToModel(churchId, rows);
  }

  public convertToModel(_churchId: string, data: any): ServiceTime {
    return { id: data.id, serviceId: data.serviceId, name: data.name, longName: data.longName };
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
