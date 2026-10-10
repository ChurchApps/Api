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
      ...this.scheduleColumns(model),
      removed: false
    }).execute();
    return model;
  }

  private async update(model: ServiceTime): Promise<ServiceTime> {
    await getDb().updateTable("serviceTimes").set({
      serviceId: model.serviceId,
      name: model.name,
      // Clients that predate schedules don't send dayOfWeek; leave an existing schedule alone for them.
      ...(model.dayOfWeek !== undefined ? this.scheduleColumns(model) : {})
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  // A schedule needs both a day and a start time; anything partial is stored as no schedule.
  private scheduleColumns(model: ServiceTime) {
    const toInt = (v: any) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v)));
    const toTime = (v: any) => (typeof v === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(v) ? v : null);
    const dayOfWeek = toInt(model.dayOfWeek);
    const startTime = toTime(model.startTime);
    const scheduled = dayOfWeek !== null && dayOfWeek >= 0 && dayOfWeek <= 6 && startTime !== null;
    return {
      dayOfWeek: scheduled ? dayOfWeek : null,
      startTime: scheduled ? startTime : null,
      endTime: scheduled ? toTime(model.endTime) : null,
      checkinOpenMinutes: scheduled ? toInt(model.checkinOpenMinutes) : null,
      checkinCloseMinutes: scheduled ? toInt(model.checkinCloseMinutes) : null
    };
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("serviceTimes").set({ removed: true }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("serviceTimes").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false).executeTakeFirst()) ?? null;
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return getDb().selectFrom("serviceTimes").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("serviceTimes").selectAll().where("churchId", "=", churchId).where("removed", "=", false).orderBy("name").execute();
  }

  public async loadNamesWithCampusService(churchId: string) {
    const rows = await sql<any>`SELECT st.*, concat_ws(' - ', c.name, s.name, st.name) as longName FROM serviceTimes st INNER JOIN services s on s.Id=st.serviceId LEFT JOIN campuses c on c.Id=s.campusId AND IFNULL(c.removed, 0)=0 WHERE s.churchId=${churchId} AND st.removed=0 AND s.removed=0 ORDER BY c.name, s.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadNamesByServiceId(churchId: string, serviceId: string) {
    const rows = await sql<any>`SELECT st.*, concat_ws(' - ', c.name, s.name, st.name) as longName FROM serviceTimes st INNER JOIN services s on s.id=st.serviceId LEFT JOIN campuses c on c.id=s.campusId AND IFNULL(c.removed, 0)=0 WHERE s.churchId=${churchId} AND s.id=${serviceId} AND st.removed=0 ORDER BY c.name, s.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadByChurchCampusService(churchId: string, campusId: string, serviceId: string) {
    const rows = await sql<any>`SELECT st.* FROM serviceTimes st LEFT OUTER JOIN services s on s.id=st.serviceId WHERE st.churchId = ${churchId} AND (${serviceId}='0' OR st.serviceId=${serviceId}) AND (${campusId} = '0' OR s.campusId = ${campusId}) AND st.removed=0`.execute(getDb());
    return rows.rows;
  }

  // Flat service+time rows for the public service-times element. Campus names are
  // resolved separately from the membership master (attendance.campuses is frozen).
  public async loadPublicTree(churchId: string) {
    const rows = await sql<any>`SELECT s.id as serviceId, s.name as serviceName, s.campusId, st.id as timeId, st.name as timeName
      FROM services s INNER JOIN serviceTimes st ON st.serviceId=s.id AND st.removed=0
      WHERE s.churchId=${churchId} AND s.removed=0
      ORDER BY s.name, st.name`.execute(getDb());
    return rows.rows;
  }

  // Groups flat rows into [{ serviceId, serviceName, campusName?, times:[{id,name}] }].
  public buildPublicTree(rows: any[], campusNames: { [id: string]: string } = {}) {
    const byService = new Map<string, any>();
    const result: any[] = [];
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      let service = byService.get(r.serviceId);
      if (!service) {
        service = { serviceId: r.serviceId, serviceName: r.serviceName, times: [] };
        const campusName = r.campusId ? campusNames[r.campusId] : undefined;
        if (campusName) service.campusName = campusName;
        byService.set(r.serviceId, service);
        result.push(service);
      }
      if (r.timeId) service.times.push({ id: r.timeId, name: r.timeName });
    });
    return result;
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]): ServiceTime[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(data: any): ServiceTime {
    const result: ServiceTime = {
      id: data.id,
      serviceId: data.serviceId,
      name: data.name,
      longName: data.longName,
      dayOfWeek: data.dayOfWeek ?? null,
      startTime: this.formatTime(data.startTime),
      endTime: this.formatTime(data.endTime),
      checkinOpenMinutes: data.checkinOpenMinutes ?? null,
      checkinCloseMinutes: data.checkinCloseMinutes ?? null
    };
    return result;
  }

  // MySQL TIME comes back as "HH:mm:ss"; clients use "HH:mm".
  private formatTime(value: any): string | null {
    if (typeof value !== "string") return null;
    const m = value.match(/^(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
  }
}
