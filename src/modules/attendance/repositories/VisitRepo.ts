import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { getDb } from "../db/index.js";
import { Visit } from "../models/index.js";

export class VisitRepo {
  public async save(model: Visit) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Visit): Promise<Visit> {
    model.id = UniqueIdHelper.shortId();
    const visitDate = model.visitDate ? DateHelper.toMysqlDateOnly(model.visitDate) : null;
    const checkinTime = model.checkinTime ? DateHelper.toMysqlDate(model.checkinTime) : null;
    await getDb().insertInto("visits").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      serviceId: model.serviceId,
      groupId: model.groupId,
      visitDate: visitDate as any,
      checkinTime: checkinTime as any,
      addedBy: model.addedBy
    }).execute();
    return model;
  }

  private async update(model: Visit): Promise<Visit> {
    const visitDate = model.visitDate ? DateHelper.toMysqlDateOnly(model.visitDate) : null;
    const checkinTime = model.checkinTime ? DateHelper.toMysqlDate(model.checkinTime) : null;
    await getDb().updateTable("visits").set({
      personId: model.personId,
      serviceId: model.serviceId,
      groupId: model.groupId,
      visitDate: visitDate as any,
      checkinTime: checkinTime as any,
      addedBy: model.addedBy
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("visits").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("visits").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("visits").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDateOnly(startDate);
    const end = DateHelper.toMysqlDateOnly(endDate);
    const rows = await sql<any>`SELECT * FROM visits WHERE churchId=${churchId} AND visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  public async loadForSessionPerson(churchId: string, sessionId: string, personId: string) {
    const rows = await sql<any>`SELECT v.* FROM sessions s LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId INNER JOIN visits v on(v.serviceId = st.serviceId or v.groupId = s.groupId) and v.visitDate = s.sessionDate WHERE v.churchId=${churchId} AND s.id = ${sessionId} AND v.personId=${personId} LIMIT 1`.execute(getDb());
    return rows.rows.length > 0 ? rows.rows[0] : null;
  }

  public async loadByServiceDatePeopleIds(churchId: string, serviceId: string, visitDate: Date, peopleIds: string[]) {
    const vsDate = DateHelper.toMysqlDateOnly(visitDate);
    const rows = await sql<any>`SELECT * FROM visits WHERE churchId=${churchId} AND serviceId = ${serviceId} AND visitDate = ${vsDate} AND personId IN (${sql.join(peopleIds)})`.execute(getDb());
    return rows.rows;
  }

  public async loadLastLoggedDate(churchId: string, serviceId: string, peopleIds: string[]) {
    let result = new Date();
    result.setHours(0, 0, 0, 0);

    const rows = await sql<any>`SELECT max(visitDate) as visitDate FROM visits WHERE churchId=${churchId} AND serviceId = ${serviceId} AND personId IN (${sql.join(peopleIds)})`.execute(getDb());
    const data: any = rows.rows.length > 0 ? rows.rows[0] : null;

    if (data?.visitDate) result = new Date(data.visitDate);
    return result;
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("visits").selectAll().where("churchId", "=", churchId).where("personId", "=", personId).execute();
  }

  public async loadConsecutiveWeekStreaks(churchId: string, personIds: string[]): Promise<Record<string, number>> {
    if (personIds.length === 0) return {};
    const rows = await sql<any>`SELECT personId, YEARWEEK(visitDate, 3) AS yw FROM visits WHERE churchId = ${churchId} AND personId IN (${sql.join(personIds)}) GROUP BY personId, yw ORDER BY personId, yw DESC`.execute(getDb());
    const data: any[] = rows.rows as any[];

    const byPerson: Record<string, number[]> = {};
    for (const row of data) {
      if (!byPerson[row.personId]) byPerson[row.personId] = [];
      byPerson[row.personId].push(row.yw);
    }

    const currentYw = this.getIsoYearWeek(new Date());
    const result: Record<string, number> = {};
    for (const personId of personIds) {
      const weeks = byPerson[personId] || [];
      result[personId] = this.countConsecutiveWeeks(weeks, currentYw);
    }
    return result;
  }

  private getIsoYearWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return d.getUTCFullYear() * 100 + weekNo;
  }

  private countConsecutiveWeeks(sortedWeeksDesc: number[], currentYw: number): number {
    if (sortedWeeksDesc.length === 0 || sortedWeeksDesc[0] !== currentYw) return 0;
    let streak = 1;
    let expectedYw = currentYw;
    for (let i = 1; i < sortedWeeksDesc.length; i++) {
      expectedYw = this.previousIsoWeek(expectedYw);
      if (sortedWeeksDesc[i] === expectedYw) streak++;
      else break;
    }
    return streak;
  }

  private previousIsoWeek(yw: number): number {
    const year = Math.floor(yw / 100);
    const week = yw % 100;
    if (week > 1) return year * 100 + (week - 1);
    const dec28 = new Date(Date.UTC(year - 1, 11, 28));
    dec28.setUTCDate(dec28.getUTCDate() + 4 - (dec28.getUTCDay() || 7));
    const lastYearStart = new Date(Date.UTC(dec28.getUTCFullYear(), 0, 1));
    const lastWeek = Math.ceil((((dec28.getTime() - lastYearStart.getTime()) / 86400000) + 1) / 7);
    return (year - 1) * 100 + lastWeek;
  }

  public convertToModel(_churchId: string, data: any): Visit {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]): Visit[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(row: any): Visit {
    return {
      id: row.id,
      personId: row.personId,
      serviceId: row.serviceId,
      groupId: row.groupId,
      visitDate: row.visitDate,
      checkinTime: row.checkinTime
    };
  }
}
