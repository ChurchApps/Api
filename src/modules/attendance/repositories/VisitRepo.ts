import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { Visit } from "../models/index.js";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

export class VisitRepo extends ConfiguredRepo<Visit> {
  protected get repoConfig(): RepoConfig<Visit> {
    return {
      tableName: "visits",
      hasSoftDelete: false,
      columns: ["personId", "serviceId", "groupId", "visitDate", "checkinTime", "addedBy"]
    };
  }

  public save(visit: Visit) {
    // Handle date conversion before saving
    const processedVisit = { ...visit };
    if (processedVisit.visitDate) {
      (processedVisit as any).visitDate = DateHelper.toMysqlDateOnly(processedVisit.visitDate);  // date-only field
    }
    if (processedVisit.checkinTime) {
      (processedVisit as any).checkinTime = DateHelper.toMysqlDate(processedVisit.checkinTime);  // datetime field
    }
    return super.save(processedVisit);
  }

  public loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    return TypedDB.query("SELECT * FROM visits WHERE churchId=? AND visitDate BETWEEN ? AND ?;", [churchId, DateHelper.toMysqlDateOnly(startDate), DateHelper.toMysqlDateOnly(endDate)]);
  }

  public loadForSessionPerson(churchId: string, sessionId: string, personId: string) {
    const sql =
      "SELECT v.*" +
      " FROM sessions s" +
      " LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId" +
      " INNER JOIN visits v on(v.serviceId = st.serviceId or v.groupId = s.groupId) and v.visitDate = s.sessionDate" +
      " WHERE v.churchId=? AND s.id = ? AND v.personId=? LIMIT 1";
    return TypedDB.queryOne(sql, [churchId, sessionId, personId]);
  }

  public loadByServiceDatePeopleIds(churchId: string, serviceId: string, visitDate: Date, peopleIds: string[]) {
    const vsDate = DateHelper.toMysqlDateOnly(visitDate);  // date-only field
    const sql = "SELECT * FROM visits WHERE churchId=? AND serviceId = ? AND visitDate = ? AND personId IN (" + ArrayHelper.fillArray("?", peopleIds.length).join(", ") + ")";
    const params = [churchId, serviceId, vsDate].concat(peopleIds);
    return TypedDB.query(sql, params);
  }

  public async loadLastLoggedDate(churchId: string, serviceId: string, peopleIds: string[]) {
    let result = new Date();
    result.setHours(0, 0, 0, 0);

    const sql = "SELECT max(visitDate) as visitDate FROM visits WHERE churchId=? AND serviceId = ? AND personId IN (" + ArrayHelper.fillArray("?", peopleIds.length).join(", ") + ")";
    const params = [churchId, serviceId].concat(peopleIds);
    const data: any = await TypedDB.queryOne(sql, params);

    if (data?.visitDate) result = new Date(data.visitDate);
    return result;
  }

  public loadForPerson(churchId: string, personId: string) {
    return TypedDB.query("SELECT * FROM visits WHERE churchId=? AND personId=?", [churchId, personId]);
  }

  public async loadConsecutiveWeekStreaks(churchId: string, personIds: string[]): Promise<Record<string, number>> {
    if (personIds.length === 0) return {};
    const sql = "SELECT personId, YEARWEEK(visitDate, 3) AS yw FROM visits WHERE churchId = ? AND personId IN ("
      + ArrayHelper.fillArray("?", personIds.length).join(", ")
      + ") GROUP BY personId, yw ORDER BY personId, yw DESC";
    const rows: any[] = await TypedDB.query(sql, [churchId, ...personIds]) as any[];

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
