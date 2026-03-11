import { injectable } from "inversify";
import { eq, and, sql, inArray, between, max } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { visits } from "../../../db/schema/attendance.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { Visit } from "../models/index.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

/** Normalize a date-only value to midnight UTC Date for consistent storage. */
function toDateOnly(val: any): Date | null {
  if (val == null) return null;
  const str = typeof val === "string" ? val : DateHelper.toMysqlDateOnly(val);
  if (!str) return null;
  return new Date(str + "T00:00:00Z");
}

/** Ensure value is a Date object (for datetime columns that include time). */
function toDate(val: any): Date | null {
  if (val == null) return null;
  if (val instanceof Date) return val;
  return new Date(val);
}

@injectable()
export class VisitRepo extends DrizzleRepo<typeof visits> {
  protected readonly table = visits;
  protected readonly moduleName = "attendance";

  public override async save(visit: Visit) {
    if (visit.id) {
      const data = { ...visit } as any;
      data.visitDate = toDateOnly(data.visitDate);
      data.checkinTime = toDate(data.checkinTime);
      const { id: _id, churchId: _cid, ...setData } = data;
      await this.db.update(visits).set(setData)
        .where(and(eq(visits.id, visit.id!), eq(visits.churchId, visit.churchId!)));
    } else {
      visit.id = UniqueIdHelper.shortId();
      const data = { ...visit } as any;
      data.visitDate = toDateOnly(data.visitDate);
      data.checkinTime = toDate(data.checkinTime);
      await this.db.insert(visits).values(data);
    }
    return visit;
  }

  public loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    return this.db.select().from(visits)
      .where(and(eq(visits.churchId, churchId), between(visits.visitDate, startDate, endDate)));
  }

  public async loadForSessionPerson(churchId: string, sessionId: string, personId: string) {
    let rows: any[];
    if (getDialect() === "postgres") {
      rows = await this.executeRows(sql`
        SELECT v.*
        FROM sessions s
        LEFT OUTER JOIN "serviceTimes" st ON st.id = s."serviceTimeId"
        INNER JOIN visits v ON (v."serviceId" = st."serviceId" OR v."groupId" = s."groupId") AND v."visitDate" = s."sessionDate"
        WHERE v."churchId" = ${churchId} AND s.id = ${sessionId} AND v."personId" = ${personId} LIMIT 1
      `);
    } else {
      rows = await this.executeRows(sql`
        SELECT v.*
        FROM sessions s
        LEFT OUTER JOIN serviceTimes st ON st.id = s.serviceTimeId
        INNER JOIN visits v ON (v.serviceId = st.serviceId OR v.groupId = s.groupId) AND v.visitDate = s.sessionDate
        WHERE v.churchId = ${churchId} AND s.id = ${sessionId} AND v.personId = ${personId} LIMIT 1
      `);
    }
    return rows.length > 0 ? rows[0] : null;
  }

  public loadByServiceDatePeopleIds(churchId: string, serviceId: string, visitDate: Date, peopleIds: string[]) {
    if (peopleIds.length === 0) return Promise.resolve([]);
    return this.db.select().from(visits)
      .where(and(
        eq(visits.churchId, churchId),
        eq(visits.serviceId, serviceId),
        eq(visits.visitDate, visitDate),
        inArray(visits.personId, peopleIds)
      ));
  }

  public async loadLastLoggedDate(churchId: string, serviceId: string, peopleIds: string[]) {
    let result = new Date();
    result.setHours(0, 0, 0, 0);
    if (peopleIds.length === 0) return result;
    const rows = await this.db.select({ visitDate: max(visits.visitDate) })
      .from(visits)
      .where(and(
        eq(visits.churchId, churchId),
        eq(visits.serviceId, serviceId),
        inArray(visits.personId, peopleIds)
      ));
    const data = rows[0] ?? null;
    if (data?.visitDate) result = new Date(data.visitDate);
    return result;
  }

  public loadForPerson(churchId: string, personId: string) {
    return this.db.select().from(visits).where(and(eq(visits.churchId, churchId), eq(visits.personId, personId)));
  }

  public async loadConsecutiveWeekStreaks(churchId: string, personIds: string[]): Promise<Record<string, number>> {
    if (personIds.length === 0) return {};
    let rows: any[];
    if (getDialect() === "postgres") {
      rows = await this.executeRows(sql`
        SELECT "personId", (EXTRACT(ISOYEAR FROM "visitDate")::integer * 100 + EXTRACT(WEEK FROM "visitDate")::integer) AS yw
        FROM visits
        WHERE "churchId" = ${churchId}
          AND "personId" IN (${sql.join(personIds.map(id => sql`${id}`), sql`, `)})
        GROUP BY "personId", yw
        ORDER BY "personId", yw DESC
      `);
    } else {
      rows = await this.executeRows(sql`
        SELECT personId, YEARWEEK(visitDate, 3) AS yw
        FROM visits
        WHERE churchId = ${churchId}
          AND personId IN (${sql.join(personIds.map(id => sql`${id}`), sql`, `)})
        GROUP BY personId, yw
        ORDER BY personId, yw DESC
      `);
    }

    const byPerson: Record<string, number[]> = {};
    for (const row of rows) {
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

  public convertToModel(_churchId: string, row: any): Visit {
    return { id: row.id, personId: row.personId, serviceId: row.serviceId, groupId: row.groupId, visitDate: row.visitDate, checkinTime: row.checkinTime };
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
