import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { getDb } from "../db/index.js";
import { Headcount } from "../models/index.js";

export class HeadcountRepo {
  public async save(model: Headcount) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Headcount): Promise<Headcount> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("headcounts").values({
      id: model.id,
      churchId: model.churchId,
      campusId: model.campusId ?? null,
      serviceId: model.serviceId ?? null,
      serviceTimeId: model.serviceTimeId ?? null,
      groupId: model.groupId ?? null,
      headcountDate: DateHelper.toMysqlDateOnly(model.headcountDate) as any,
      value: model.value,
      enteredBy: model.enteredBy ?? null
    }).execute();
    return model;
  }

  private async update(model: Headcount): Promise<Headcount> {
    await getDb().updateTable("headcounts").set({
      campusId: model.campusId ?? null,
      serviceId: model.serviceId ?? null,
      serviceTimeId: model.serviceTimeId ?? null,
      groupId: model.groupId ?? null,
      headcountDate: DateHelper.toMysqlDateOnly(model.headcountDate) as any,
      value: model.value
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("headcounts").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("headcounts").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    const rows = await sql<any>`SELECT h.*, ser.name AS serviceName, st.name AS serviceTimeName FROM headcounts h LEFT JOIN serviceTimes st ON st.id = h.serviceTimeId LEFT JOIN services ser ON ser.id = COALESCE(h.serviceId, st.serviceId) WHERE h.churchId=${churchId} ORDER BY h.headcountDate DESC, ser.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadByServiceTimeId(churchId: string, serviceTimeId: string) {
    return getDb().selectFrom("headcounts").selectAll().where("churchId", "=", churchId).where("serviceTimeId", "=", serviceTimeId).orderBy("headcountDate", "desc").execute();
  }

  public async loadByGroupId(churchId: string, groupId: string) {
    return getDb().selectFrom("headcounts").selectAll().where("churchId", "=", churchId).where("groupId", "=", groupId).orderBy("headcountDate", "desc").execute();
  }

  public convertToModel(_churchId: string, data: any): Headcount {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]): Headcount[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(row: any): Headcount {
    const result: Headcount = {
      id: row.id,
      campusId: row.campusId,
      serviceId: row.serviceId,
      serviceTimeId: row.serviceTimeId,
      groupId: row.groupId,
      headcountDate: row.headcountDate,
      value: row.value === null || row.value === undefined ? undefined : Number(row.value),
      enteredBy: row.enteredBy
    };
    if (row.serviceName !== undefined) result.serviceName = row.serviceName;
    if (row.serviceTimeName !== undefined) result.serviceTimeName = row.serviceTimeName;
    return result;
  }
}
