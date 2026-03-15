import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { campuses } from "../../../db/schema/attendance.js";
import { Campus } from "../models/index.js";

@injectable()
export class CampusRepo extends DrizzleRepo<typeof campuses> {
  protected readonly table = campuses;
  protected readonly moduleName = "attendance";
  protected readonly softDelete = true;

  public override loadAll(churchId: string) {
    return this.db.select().from(campuses)
      .where(and(eq(campuses.churchId, churchId), eq(campuses.removed, false)))
      .orderBy(campuses.name);
  }

  public convertToModel(_churchId: string, data: any): Campus {
    return { id: data.id, name: data.name, address1: data.address1, address2: data.address2, city: data.city, state: data.state, zip: data.zip, importKey: data.importKey };
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
