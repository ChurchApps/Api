import { injectable } from "inversify";
import { eq, and, sql, asc } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { serviceTimes, services, campuses } from "../../../db/schema/attendance.js";
import { ServiceTime } from "../models/index.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

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
    const rows = await this.db.select({
      id: serviceTimes.id,
      serviceId: serviceTimes.serviceId,
      name: serviceTimes.name,
      longName: sql`concat(${campuses.name}, ' - ', ${services.name}, ' - ', ${serviceTimes.name})`.as("longName")
    })
      .from(serviceTimes)
      .innerJoin(services, eq(services.id, serviceTimes.serviceId))
      .innerJoin(campuses, eq(campuses.id, services.campusId))
      .where(and(eq(services.churchId, churchId), eq(serviceTimes.removed, false), eq(services.removed, false), eq(campuses.removed, false)))
      .orderBy(asc(campuses.name), asc(services.name), asc(serviceTimes.name));
    return this.convertAllToModel(churchId, rows);
  }

  public async loadNamesByServiceId(churchId: string, serviceId: string) {
    const rows = await this.db.select({
      id: serviceTimes.id,
      serviceId: serviceTimes.serviceId,
      name: serviceTimes.name,
      longName: sql`concat(${campuses.name}, ' - ', ${services.name}, ' - ', ${serviceTimes.name})`.as("longName")
    })
      .from(serviceTimes)
      .innerJoin(services, eq(services.id, serviceTimes.serviceId))
      .innerJoin(campuses, eq(campuses.id, services.campusId))
      .where(and(eq(services.churchId, churchId), eq(services.id, serviceId), eq(serviceTimes.removed, false)))
      .orderBy(asc(campuses.name), asc(services.name), asc(serviceTimes.name));
    return this.convertAllToModel(churchId, rows);
  }

  public async loadByChurchCampusService(churchId: string, campusId: string, serviceId: string) {
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT st.*
          FROM "serviceTimes" st
          LEFT OUTER JOIN services s ON s.id = st."serviceId"
          WHERE st."churchId" = ${churchId}
            AND (${serviceId} = '0' OR st."serviceId" = ${serviceId})
            AND (${campusId} = '0' OR s."campusId" = ${campusId})
            AND st.removed = false`
        : sql`
          SELECT st.*
          FROM serviceTimes st
          LEFT OUTER JOIN services s ON s.id = st.serviceId
          WHERE st.churchId = ${churchId}
            AND (${serviceId} = '0' OR st.serviceId = ${serviceId})
            AND (${campusId} = '0' OR s.campusId = ${campusId})
            AND st.removed = 0`
    );
    return this.convertAllToModel(churchId, rows);
  }

  public convertToModel(_churchId: string, data: any): ServiceTime {
    return { id: data.id, serviceId: data.serviceId, name: data.name, longName: data.longName };
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
