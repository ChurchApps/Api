import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { services } from "../../../db/schema/attendance.js";
import { Service } from "../models/index.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class ServiceRepo extends DrizzleRepo<typeof services> {
  protected readonly table = services;
  protected readonly moduleName = "attendance";
  protected readonly softDelete = true;

  public override loadAll(churchId: string) {
    return this.db.select().from(services)
      .where(and(eq(services.churchId, churchId), eq(services.removed, false)))
      .orderBy(services.name);
  }

  public async loadWithCampus(churchId: string) {
    const removed = getDialect() === "postgres" ? sql.raw("false") : sql.raw("0");
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT s.*, c.name as "campusName"
          FROM services s
          INNER JOIN campuses c ON c.id = s."campusId"
          WHERE s."churchId" = ${churchId} AND s.removed = ${removed} AND c.removed = ${removed}
          ORDER BY c.name, s.name`
        : sql`
          SELECT s.*, c.name as campusName
          FROM services s
          INNER JOIN campuses c ON c.id = s.campusId
          WHERE s.churchId = ${churchId} AND s.removed = 0 AND c.removed = 0
          ORDER BY c.name, s.name`
    );
    return this.convertAllToModel(churchId, rows);
  }

  public async searchByCampus(churchId: string, campusId: string) {
    const rows = await this.executeRows(
      getDialect() === "postgres"
        ? sql`
          SELECT * FROM services
          WHERE "churchId" = ${churchId} AND (${campusId} = '0' OR "campusId" = ${campusId}) AND removed = false
          ORDER BY name`
        : sql`
          SELECT * FROM services
          WHERE churchId = ${churchId} AND (${campusId} = '0' OR campusId = ${campusId}) AND removed = 0
          ORDER BY name`
    );
    return this.convertAllToModel(churchId, rows);
  }

  public convertToModel(_churchId: string, data: any): Service {
    const result: Service = { id: data.id, campusId: data.campusId, name: data.name };
    if (data.campusName !== undefined) result.campus = { id: result.campusId, name: data.campusName };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
