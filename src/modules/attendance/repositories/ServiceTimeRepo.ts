import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { ServiceTime } from "../models/index.js";

@injectable()
export class ServiceTimeRepo {
  public async save(model: ServiceTime) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ServiceTime): Promise<ServiceTime> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("serviceTimes").values({
      id: model.id,
      churchId: model.churchId,
      serviceId: model.serviceId,
      name: model.name,
      removed: false
    }).execute();
    return model;
  }

  private async update(model: ServiceTime): Promise<ServiceTime> {
    await getDb().updateTable("serviceTimes").set({
      serviceId: model.serviceId,
      name: model.name
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("serviceTimes").set({ removed: true }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("serviceTimes").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("serviceTimes").selectAll().where("churchId", "=", churchId).where("removed", "=", false).orderBy("name").execute();
  }

  public async loadNamesWithCampusService(churchId: string) {
    const rows = await sql<any>`SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName FROM serviceTimes st INNER JOIN services s on s.Id=st.serviceId INNER JOIN campuses c on c.Id=s.campusId WHERE s.churchId=${churchId} AND st.removed=0 AND s.removed=0 AND c.removed=0 ORDER BY c.name, s.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadNamesByServiceId(churchId: string, serviceId: string) {
    const rows = await sql<any>`SELECT st.*, concat(c.name, ' - ', s.name, ' - ', st.name) as longName FROM serviceTimes st INNER JOIN services s on s.id=st.serviceId INNER JOIN campuses c on c.id=s.campusId WHERE s.churchId=${churchId} AND s.id=${serviceId} AND st.removed=0 ORDER BY c.name, s.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadByChurchCampusService(churchId: string, campusId: string, serviceId: string) {
    const rows = await sql<any>`SELECT st.* FROM serviceTimes st LEFT OUTER JOIN services s on s.id=st.serviceId WHERE st.churchId = ${churchId} AND (${serviceId}='0' OR st.serviceId=${serviceId}) AND (${campusId} = '0' OR s.campusId = ${campusId}) AND st.removed=0`.execute(getDb());
    return rows.rows;
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]): ServiceTime[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(data: any): ServiceTime {
    const result: ServiceTime = { id: data.id, serviceId: data.serviceId, name: data.name, longName: data.longName };
    return result;
  }
}
