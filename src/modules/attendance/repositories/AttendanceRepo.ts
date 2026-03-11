import { injectable } from "inversify";
import { eq, and, sql, between, desc, asc } from "drizzle-orm";
import { getDrizzleDb } from "../../../db/drizzle.js";
import { campuses, services, serviceTimes, sessions, visits, visitSessions } from "../../../db/schema/attendance.js";
import { AttendanceRecord } from "../models/index.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class AttendanceRepo {
  private get db(): any { return getDrizzleDb("attendance"); }

  private async executeRows(query: any): Promise<any[]> {
    const result = await (this.db as any).execute(query);
    if (getDialect() === "postgres") return Array.isArray(result) ? result : [];
    return (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result as any[];
  }

  public loadTree(churchId: string) {
    const removedCheck = getDialect() === "postgres"
      ? sql`COALESCE(${services.removed}, false) = false`
      : sql`COALESCE(${services.removed}, 0) = 0`;
    const removedCheckSt = getDialect() === "postgres"
      ? sql`COALESCE(${serviceTimes.removed}, false) = false`
      : sql`COALESCE(${serviceTimes.removed}, 0) = 0`;
    const removedCheckC = getDialect() === "postgres"
      ? sql`COALESCE(${campuses.removed}, false) = false`
      : sql`COALESCE(${campuses.removed}, 0) = 0`;

    return (this.db as any).select({
      campusId: campuses.id,
      campusName: sql`COALESCE(${campuses.name}, 'Unassigned')`.as("campusName"),
      serviceId: services.id,
      serviceName: services.name,
      serviceTimeId: serviceTimes.id,
      serviceTimeName: serviceTimes.name
    })
      .from(campuses)
      .leftJoin(services, and(eq(services.campusId, campuses.id), removedCheck))
      .leftJoin(serviceTimes, and(eq(serviceTimes.serviceId, services.id), removedCheckSt))
      .where(and(
        sql`(${campuses.id} IS NULL OR ${campuses.churchId} = ${churchId})`,
        removedCheckC
      ))
      .orderBy(sql`"campusName"`, sql`"serviceName"`, sql`"serviceTimeName"`);
  }

  public loadTrend(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, groupId: string) {
    if (getDialect() === "postgres") {
      return this.executeRows(sql`
        SELECT date_trunc('week', v."visitDate") AS week,
          count(distinct(v.id)) as visits
        FROM visits v
        LEFT JOIN "visitSessions" vs ON vs."visitId" = v.id
        LEFT JOIN sessions s ON s.id = vs."sessionId"
        LEFT JOIN "groupServiceTimes" gst ON gst."groupId" = s."groupId"
        LEFT JOIN "serviceTimes" st ON st.id = gst."serviceTimeId"
        LEFT JOIN services ser ON ser.id = st."serviceId"
        WHERE v."churchId" = ${churchId}
          AND ${groupId} IN ('0', s."groupId")
          AND ${serviceTimeId} IN ('0', st.id)
          AND ${serviceId} IN ('0', ser.id)
          AND ${campusId} IN ('0', ser."campusId")
        GROUP BY date_trunc('week', v."visitDate")
        ORDER BY date_trunc('week', v."visitDate")
      `);
    }
    return this.executeRows(sql`
      SELECT STR_TO_DATE(concat(year(v.visitDate), ' ', week(v.visitDate, 0), ' Sunday'), '%X %V %W') AS week,
        count(distinct(v.id)) as visits
      FROM visits v
      LEFT JOIN visitSessions vs ON vs.visitId = v.id
      LEFT JOIN sessions s ON s.id = vs.sessionId
      LEFT JOIN groupServiceTimes gst ON gst.groupId = s.groupId
      LEFT JOIN serviceTimes st ON st.id = gst.serviceTimeId
      LEFT JOIN services ser ON ser.id = st.serviceId
      WHERE v.churchId = ${churchId}
        AND ${groupId} IN ('0', s.groupId)
        AND ${serviceTimeId} IN ('0', st.id)
        AND ${serviceId} IN ('0', ser.id)
        AND ${campusId} IN ('0', ser.campusId)
      GROUP BY year(v.visitDate), week(v.visitDate, 0),
        STR_TO_DATE(concat(year(v.visitDate), ' ', week(v.visitDate, 0), ' Sunday'), '%X %V %W')
      ORDER BY year(v.visitDate), week(v.visitDate, 0)
    `);
  }

  public loadGroups(churchId: string, serviceId: string, week: Date) {
    const weekEnd = new Date(week);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return this.db.select({
      serviceName: services.name,
      serviceTimeName: serviceTimes.name,
      groupId: sessions.groupId,
      personId: visits.personId
    })
      .from(visits)
      .innerJoin(visitSessions, and(eq(visitSessions.churchId, visits.churchId), eq(visitSessions.visitId, visits.id)))
      .innerJoin(sessions, eq(sessions.id, visitSessions.sessionId))
      .innerJoin(serviceTimes, eq(serviceTimes.id, sessions.serviceTimeId))
      .innerJoin(services, eq(services.id, serviceTimes.serviceId))
      .where(and(
        eq(visits.churchId, churchId),
        sql`${serviceId} IN (0, ${services.id})`,
        between(sessions.sessionDate, week, weekEnd)
      ))
      .orderBy(asc(services.name), asc(serviceTimes.name));
  }

  public loadForPerson(churchId: string, personId: string) {
    return this.db.select({
      visitDate: visits.visitDate,
      campusId: campuses.id,
      campusName: campuses.name,
      serviceId: services.id,
      serviceName: services.name,
      serviceTimeId: serviceTimes.id,
      serviceTimeName: serviceTimes.name,
      groupId: sessions.groupId
    })
      .from(visits)
      .innerJoin(visitSessions, eq(visitSessions.visitId, visits.id))
      .innerJoin(sessions, eq(sessions.id, visitSessions.sessionId))
      .leftJoin(serviceTimes, eq(serviceTimes.id, sessions.serviceTimeId))
      .leftJoin(services, eq(services.id, serviceTimes.serviceId))
      .leftJoin(campuses, eq(campuses.id, services.campusId))
      .where(and(eq(visits.churchId, churchId), eq(visits.personId, personId)))
      .orderBy(desc(visits.visitDate), asc(campuses.name), asc(services.name), asc(serviceTimes.name));
  }

  public loadByCampusId(churchId: string, campusId: string, startDate: Date, endDate: Date) {
    return this.db.select({
      id: visits.id,
      churchId: visits.churchId,
      personId: visits.personId,
      serviceId: visits.serviceId,
      groupId: visits.groupId,
      visitDate: visits.visitDate,
      checkinTime: visits.checkinTime,
      addedBy: visits.addedBy,
      campusId: campuses.id,
      campusName: campuses.name
    })
      .from(visits)
      .innerJoin(services, eq(services.id, visits.serviceId))
      .innerJoin(campuses, eq(campuses.id, services.campusId))
      .where(and(eq(visits.churchId, churchId), eq(services.campusId, campusId), between(visits.visitDate, startDate, endDate)));
  }

  public loadByServiceId(churchId: string, serviceId: string, startDate: Date, endDate: Date) {
    return this.db.select({
      id: visits.id,
      churchId: visits.churchId,
      personId: visits.personId,
      serviceId: visits.serviceId,
      groupId: visits.groupId,
      visitDate: visits.visitDate,
      checkinTime: visits.checkinTime,
      addedBy: visits.addedBy,
      serviceName: services.name
    })
      .from(visits)
      .innerJoin(services, eq(services.id, visits.serviceId))
      .where(and(eq(visits.churchId, churchId), eq(visits.serviceId, serviceId), between(visits.visitDate, startDate, endDate)));
  }

  public loadByServiceTimeId(churchId: string, serviceTimeId: string, startDate: Date, endDate: Date) {
    return this.db.select({
      id: visits.id,
      churchId: visits.churchId,
      personId: visits.personId,
      serviceId: visits.serviceId,
      groupId: visits.groupId,
      visitDate: visits.visitDate,
      checkinTime: visits.checkinTime,
      addedBy: visits.addedBy,
      serviceTimeName: serviceTimes.name
    })
      .from(visits)
      .innerJoin(visitSessions, eq(visitSessions.visitId, visits.id))
      .innerJoin(sessions, eq(sessions.id, visitSessions.sessionId))
      .leftJoin(serviceTimes, eq(serviceTimes.id, sessions.serviceTimeId))
      .where(and(eq(visits.churchId, churchId), eq(serviceTimes.id, serviceTimeId), between(visits.visitDate, startDate, endDate)));
  }

  public loadByGroupId(churchId: string, groupId: string, startDate: Date, endDate: Date) {
    return this.db.select({
      id: visits.id,
      churchId: visits.churchId,
      personId: visits.personId,
      serviceId: visits.serviceId,
      groupId: visits.groupId,
      visitDate: visits.visitDate,
      checkinTime: visits.checkinTime,
      addedBy: visits.addedBy
    })
      .from(visits)
      .innerJoin(visitSessions, eq(visitSessions.visitId, visits.id))
      .innerJoin(sessions, eq(sessions.id, visitSessions.sessionId))
      .where(and(eq(visits.churchId, churchId), eq(sessions.groupId, groupId), between(visits.visitDate, startDate, endDate)));
  }

  public convertToModel(_churchId: string, data: any): AttendanceRecord {
    const result: AttendanceRecord = {
      visitDate: data.visitDate,
      week: data.week,
      count: data.count,
      groupId: data.groupId
    };
    if (data.campusId !== undefined || data.campusName !== undefined) result.campus = { id: data.campusId, name: data.campusName };
    if (data.serviceId !== null || data.serviceName !== null) result.service = { id: data.serviceId, name: data.serviceName, campusId: data.campusId };
    if (data.serviceTimeId !== null || data.serviceTimeName !== null) result.serviceTime = { id: data.serviceTimeId, name: data.serviceTimeName, serviceId: data.serviceId };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
