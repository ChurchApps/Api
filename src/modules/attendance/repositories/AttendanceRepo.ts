import { injectable } from "inversify";
import { sql } from "kysely";
import { DateHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { AttendanceRecord } from "../models/index.js";
import type { VisitRow } from "./VisitRepo.js";

// Flat row read by loadTree / loadForPerson and folded into an AttendanceRecord.
export interface AttendanceRecordRow {
  visitDate?: Date;
  checkinTime?: Date;
  checkoutTime?: Date;
  checkedOutBy?: string;
  checkedInById?: string;
  week?: number;
  count?: number;
  groupId?: string;
  campusId?: string;
  campusName?: string;
  serviceId?: string;
  serviceName?: string;
  serviceTimeId?: string;
  serviceTimeName?: string;
}

// COUNT() columns may arrive as numbers or numeric strings depending on the driver, so callers wrap them in Number().
export interface AttendanceTrendRow {
  week: Date;
  visits: number | string;
}

export interface AttendanceGroupRow {
  serviceName: string;
  serviceTimeName: string;
  groupId: string;
  personId: string;
}

export interface AttendanceGroupSummaryRow {
  groupId: string;
  sessionCount: number | string;
  totalVisits: number | string;
  lastSessionDate: Date;
}

export interface AttendanceSessionStatusRow {
  groupId: string;
  sessionId: string | null;
  attendanceCount: number | string;
}

@injectable()
export class AttendanceRepo {


  public async loadTree(churchId: string) {
    const rows = await sql<AttendanceRecordRow>`SELECT s.campusId as campusId, c.name as campusName, s.id as serviceId, s.name as serviceName, st.id as serviceTimeId, st.name as serviceTimeName FROM services s LEFT JOIN campuses c on c.id = s.campusId AND IFNULL(c.removed, 0) = 0 LEFT JOIN serviceTimes st on st.serviceId = s.id AND IFNULL(st.removed, 0) = 0 WHERE s.churchId = ${churchId} AND IFNULL(s.removed, 0) = 0 ORDER by campusName, serviceName, serviceTimeName`.execute(getDb());
    return rows.rows;
  }

  public async loadTrend(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, groupId: string) {
    const rows = await sql<AttendanceTrendRow>`SELECT STR_TO_DATE(concat(year(v.visitDate), ' ', week(v.visitDate, 0), ' Sunday'), '%X %V %W') AS week, count(distinct(v.id)) as visits FROM visits v LEFT JOIN visitSessions vs on vs.visitId=v.id LEFT JOIN sessions s on s.id = vs.sessionId LEFT JOIN groupServiceTimes gst on gst.groupId = s.groupId LEFT JOIN serviceTimes st on st.id = gst.serviceTimeId LEFT JOIN services ser on ser.id = st.serviceId WHERE v.churchId=${churchId} AND ${groupId} IN ('0', s.groupId) AND ${serviceTimeId} IN ('0', st.id) AND ${serviceId} IN ('0', ser.id) AND ${campusId} IN ('0', ser.campusId) GROUP BY year(v.visitDate), week(v.visitDate, 0), STR_TO_DATE(concat(year(v.visitDate), ' ', week(v.visitDate, 0), ' Sunday'), '%X %V %W') ORDER BY year(v.visitDate), week(v.visitDate, 0)`.execute(getDb());
    return rows.rows;
  }

  public async loadGroups(churchId: string, serviceId: string, week: Date) {
    const rows = await sql<AttendanceGroupRow>`SELECT ser.name as serviceName, st.name as serviceTimeName, s.groupId, v.personId FROM visits v INNER JOIN visitSessions vs on vs.churchId=v.churchId AND vs.visitId=v.id INNER JOIN sessions s on s.id=vs.sessionId INNER JOIN serviceTimes st on st.id=s.serviceTimeId INNER JOIN services ser on ser.id=st.serviceId WHERE v.churchId=${churchId} AND (${serviceId} IN ('', '0') OR ser.id = ${serviceId}) AND s.sessionDate >= ${week} AND s.sessionDate < DATE_ADD(${week}, INTERVAL 7 DAY) ORDER by ser.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadGroupSummary(churchId: string, weeks: number) {
    const rows = await sql<AttendanceGroupSummaryRow>`SELECT s.groupId, COUNT(DISTINCT s.id) AS sessionCount, COUNT(vs.id) AS totalVisits, MAX(s.sessionDate) AS lastSessionDate FROM sessions s LEFT JOIN visitSessions vs ON vs.sessionId = s.id WHERE s.churchId=${churchId} AND s.sessionDate >= DATE_SUB(CURDATE(), INTERVAL ${weeks} WEEK) GROUP BY s.groupId`.execute(getDb());
    return rows.rows;
  }

  // Every group assigned to the service time, with its session (if any) on that date and how many were marked present.
  public async loadSessionStatus(churchId: string, serviceTimeId: string, date: string) {
    const rows = await sql<AttendanceSessionStatusRow>`SELECT gst.groupId, MAX(s.id) AS sessionId, COUNT(vs.id) AS attendanceCount FROM groupServiceTimes gst LEFT JOIN sessions s ON s.churchId=gst.churchId AND s.groupId=gst.groupId AND s.serviceTimeId=gst.serviceTimeId AND DATE(s.sessionDate)=${date} LEFT JOIN visitSessions vs ON vs.sessionId=s.id AND vs.churchId=gst.churchId WHERE gst.churchId=${churchId} AND gst.serviceTimeId=${serviceTimeId} GROUP BY gst.groupId`.execute(getDb());
    return rows.rows;
  }

  public async loadForPerson(churchId: string, personId: string, since?: Date) {
    const sinceFilter = since ? sql`AND v.visitDate >= ${DateHelper.toMysqlDate(since)}` : sql``;
    const rows = await sql<AttendanceRecordRow>`SELECT v.visitDate, v.checkinTime, v.checkoutTime, v.checkedOutBy, v.checkedInById, c.id as campusId, c.name as campusName, ser.id as serviceId, ser.name as serviceName, st.id as serviceTimeId, st.name as serviceTimeName, s.groupId FROM visits v INNER JOIN visitSessions vs on vs.visitId = v.id INNER JOIN sessions s on s.id = vs.sessionId LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId LEFT OUTER JOIN services ser on ser.Id = st.serviceId LEFT OUTER JOIN campuses c on c.id = ser.campusId WHERE v.churchId=${churchId} AND v.PersonId = ${personId} ${sinceFilter} ORDER BY v.visitDate desc, c.name, ser.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadByCampusId(churchId: string, campusId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);

    const rows = await sql<VisitRow & { campusId: string; campusName: string }>`SELECT v.*, ser.campusId as campusId, c.name as campusName FROM visits v INNER JOIN services ser on ser.id = v.serviceId LEFT JOIN campuses c on c.id = ser.campusId AND IFNULL(c.removed, 0)=0 WHERE v.churchId=${churchId} AND ser.campusId=${campusId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  public async loadByServiceId(churchId: string, serviceId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const rows = await sql<VisitRow & { serviceName: string }>`SELECT v.*, ser.name as serviceName FROM visits v INNER JOIN services ser on ser.id = v.serviceId WHERE v.churchId=${churchId} AND v.serviceId=${serviceId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  public async loadByServiceTimeId(churchId: string, serviceTimeId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const rows = await sql<VisitRow & { serviceTimeName: string }>`SELECT v.*, st.name as serviceTimeName FROM visits v INNER JOIN visitSessions vs on vs.visitId = v.id INNER JOIN sessions s on s.id = vs.sessionId LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId WHERE v.churchId=${churchId} AND st.id=${serviceTimeId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  public async loadByGroupId(churchId: string, groupId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const rows = await sql<VisitRow>`SELECT v.* FROM visits v INNER JOIN visitSessions vs on vs.visitId = v.id INNER JOIN sessions s on s.id = vs.sessionId WHERE v.churchId=${churchId} AND s.groupId=${groupId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  protected rowToModel(data: AttendanceRecordRow): AttendanceRecord {
    const result: AttendanceRecord = {
      visitDate: data.visitDate,
      checkinTime: data.checkinTime,
      checkoutTime: data.checkoutTime,
      checkedOutBy: data.checkedOutBy,
      checkedInById: data.checkedInById,
      week: data.week,
      count: data.count,
      groupId: data.groupId
    };
    if (data.campusId !== undefined || data.campusName !== undefined) result.campus = { id: data.campusId, name: data.campusName };
    if (data.serviceId !== null || data.serviceName !== null) result.service = { id: data.serviceId, name: data.serviceName, campusId: data.campusId };
    if (data.serviceTimeId !== null || data.serviceTimeName !== null) result.serviceTime = { id: data.serviceTimeId, name: data.serviceTimeName, serviceId: data.serviceId };
    return result;
  }

  public convertToModel(_churchId: string, data: AttendanceRecordRow): AttendanceRecord {
    return this.rowToModel(data);
  }

  public convertAllToModel(churchId: string, data: AttendanceRecordRow[]): AttendanceRecord[] {
    return data.map((row) => this.convertToModel(churchId, row));
  }
}
