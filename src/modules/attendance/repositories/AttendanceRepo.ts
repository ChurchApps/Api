import { injectable } from "inversify";
import { sql } from "drizzle-orm";
import { DateHelper } from "@churchapps/apihelper";
import { getDrizzleDb } from "../../../db/drizzle.js";
import { AttendanceRecord } from "../models/index.js";

@injectable()
export class AttendanceRepo {
  private get db() { return getDrizzleDb("attendance"); }

  private async executeRows(query: any): Promise<any[]> {
    const result = await this.db.execute(query);
    return (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result as any[];
  }

  public loadTree(churchId: string) {
    return this.executeRows(sql`
      SELECT c.id as campusId, IFNULL(c.name, 'Unassigned') as campusName,
        s.id as serviceId, s.name as serviceName,
        st.id as serviceTimeId, st.name as serviceTimeName
      FROM campuses c
      LEFT JOIN services s ON s.campusId = c.id AND IFNULL(s.removed, 0) = 0
      LEFT JOIN serviceTimes st ON st.serviceId = s.id AND IFNULL(st.removed, 0) = 0
      WHERE (c.id IS NULL OR c.churchId = ${churchId}) AND IFNULL(c.removed, 0) = 0
      ORDER BY campusName, serviceName, serviceTimeName
    `);
  }

  public loadTrend(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, groupId: string) {
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
    return this.executeRows(sql`
      SELECT ser.name as serviceName, st.name as serviceTimeName, s.groupId, v.personId
      FROM visits v
      INNER JOIN visitSessions vs ON vs.churchId = v.churchId AND vs.visitId = v.id
      INNER JOIN sessions s ON s.id = vs.sessionId
      INNER JOIN serviceTimes st ON st.id = s.serviceTimeId
      INNER JOIN services ser ON ser.id = st.serviceId
      WHERE v.churchId = ${churchId}
        AND ${serviceId} IN (0, ser.id)
        AND s.sessionDate BETWEEN ${week} AND DATE_ADD(${week}, INTERVAL 7 DAY)
      ORDER BY ser.name, st.name
    `);
  }

  public loadForPerson(churchId: string, personId: string) {
    return this.executeRows(sql`
      SELECT v.visitDate, c.id as campusId, c.name as campusName,
        ser.id as serviceId, ser.name as serviceName,
        st.id as serviceTimeId, st.name as serviceTimeName, s.groupId
      FROM visits v
      INNER JOIN visitSessions vs ON vs.visitId = v.id
      INNER JOIN sessions s ON s.id = vs.sessionId
      LEFT OUTER JOIN serviceTimes st ON st.id = s.serviceTimeId
      LEFT OUTER JOIN services ser ON ser.id = st.serviceId
      LEFT OUTER JOIN campuses c ON c.id = ser.campusId
      WHERE v.churchId = ${churchId} AND v.personId = ${personId}
      ORDER BY v.visitDate DESC, c.name, ser.name, st.name
    `);
  }

  public loadByCampusId(churchId: string, campusId: string, startDate: Date, endDate: Date) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    return this.executeRows(sql`
      SELECT v.*, c.id as campusId, c.name as campusName
      FROM visits v
      INNER JOIN services ser ON ser.id = v.serviceId
      INNER JOIN campuses c ON c.id = ser.campusId
      WHERE v.churchId = ${churchId} AND ser.campusId = ${campusId}
        AND v.visitDate BETWEEN ${sDate} AND ${eDate}
    `);
  }

  public loadByServiceId(churchId: string, serviceId: string, startDate: Date, endDate: Date) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    return this.executeRows(sql`
      SELECT v.*, ser.name as serviceName
      FROM visits v
      INNER JOIN services ser ON ser.id = v.serviceId
      WHERE v.churchId = ${churchId} AND v.serviceId = ${serviceId}
        AND v.visitDate BETWEEN ${sDate} AND ${eDate}
    `);
  }

  public loadByServiceTimeId(churchId: string, serviceTimeId: string, startDate: Date, endDate: Date) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    return this.executeRows(sql`
      SELECT v.*, st.name as serviceTimeName
      FROM visits v
      INNER JOIN visitSessions vs ON vs.visitId = v.id
      INNER JOIN sessions s ON s.id = vs.sessionId
      LEFT OUTER JOIN serviceTimes st ON st.id = s.serviceTimeId
      WHERE v.churchId = ${churchId} AND st.id = ${serviceTimeId}
        AND v.visitDate BETWEEN ${sDate} AND ${eDate}
    `);
  }

  public loadByGroupId(churchId: string, groupId: string, startDate: Date, endDate: Date) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    return this.executeRows(sql`
      SELECT v.*
      FROM visits v
      INNER JOIN visitSessions vs ON vs.visitId = v.id
      INNER JOIN sessions s ON s.id = vs.sessionId
      WHERE v.churchId = ${churchId} AND s.groupId = ${groupId}
        AND v.visitDate BETWEEN ${sDate} AND ${eDate}
    `);
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
