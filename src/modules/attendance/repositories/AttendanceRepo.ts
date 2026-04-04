import { injectable } from "inversify";
import { sql } from "kysely";
import { DateHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { AttendanceRecord } from "../models/index.js";

@injectable()
export class AttendanceRepo {

  public async loadTree(churchId: string) {
    const rows = await sql<any>`SELECT c.id as campusId, IFNULL(c.name, 'Unassigned') as campusName, s.id as serviceId, s.name as serviceName, st.id as serviceTimeId, st.name as serviceTimeName FROM campuses c LEFT JOIN services s on s.campusId = c.id AND IFNULL(s.removed, 0) = 0 LEFT JOIN serviceTimes st on st.serviceId = s.id AND IFNULL(st.removed, 0) = 0 WHERE(c.id is NULL or c.churchId = ${churchId}) AND IFNULL(c.removed, 0) = 0 ORDER by campusName, serviceName, serviceTimeName`.execute(getDb());
    return rows.rows.map((row: any) => this.rowToModel(row));
  }

  public async loadTrend(churchId: string, campusId: string, serviceId: string, serviceTimeId: string, groupId: string) {
    const rows = await sql<any>`SELECT STR_TO_DATE(concat(year(v.visitDate), ' ', week(v.visitDate, 0), ' Sunday'), '%X %V %W') AS week, count(distinct(v.id)) as visits FROM visits v LEFT JOIN visitSessions vs on vs.visitId=v.id LEFT JOIN sessions s on s.id = vs.sessionId LEFT JOIN groupServiceTimes gst on gst.groupId = s.groupId LEFT JOIN serviceTimes st on st.id = gst.serviceTimeId LEFT JOIN services ser on ser.id = st.serviceId WHERE v.churchId=${churchId} AND ${groupId} IN ('0', s.groupId) AND ${serviceTimeId} IN ('0', st.id) AND ${serviceId} IN ('0', ser.id) AND ${campusId} IN ('0', ser.campusId) GROUP BY year(v.visitDate), week(v.visitDate, 0), STR_TO_DATE(concat(year(v.visitDate), ' ', week(v.visitDate, 0), ' Sunday'), '%X %V %W') ORDER BY year(v.visitDate), week(v.visitDate, 0)`.execute(getDb());
    return rows.rows;
  }

  public async loadGroups(churchId: string, serviceId: string, week: Date) {
    const rows = await sql<any>`SELECT ser.name as serviceName, st.name as serviceTimeName, s.groupId, v.personId FROM visits v INNER JOIN visitSessions vs on vs.churchId=v.churchId AND vs.visitId=v.id INNER JOIN sessions s on s.id=vs.sessionId INNER JOIN serviceTimes st on st.id=s.serviceTimeId INNER JOIN services ser on ser.id=st.serviceId WHERE v.churchId=${churchId} AND ${serviceId} IN (0, ser.id) AND s.sessionDate BETWEEN ${week} AND DATE_ADD(${week}, INTERVAL 7 DAY) ORDER by ser.name, st.name`.execute(getDb());
    return rows.rows;
  }

  public async loadForPerson(churchId: string, personId: string) {
    const rows = await sql<any>`SELECT v.visitDate, c.id as campusId, c.name as campusName, ser.id as serviceId, ser.name as serviceName, st.id as serviceTimeId, st.name as serviceTimeName, s.groupId FROM visits v INNER JOIN visitSessions vs on vs.visitId = v.id INNER JOIN sessions s on s.id = vs.sessionId LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId LEFT OUTER JOIN services ser on ser.Id = st.serviceId LEFT OUTER JOIN campuses c on c.id = ser.campusId WHERE v.churchId=${churchId} AND v.PersonId = ${personId} ORDER BY v.visitDate desc, c.name, ser.name, st.name`.execute(getDb());
    return rows.rows.map((row: any) => this.rowToModel(row));
  }

  public async loadByCampusId(churchId: string, campusId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const rows = await sql<any>`SELECT v.*, c.id as campusId, c.name as campusName FROM visits v INNER JOIN services ser on ser.id = v.serviceId INNER JOIN campuses c on c.id = ser.campusId WHERE v.churchId=${churchId} AND ser.campusId=${campusId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  public async loadByServiceId(churchId: string, serviceId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const rows = await sql<any>`SELECT v.*, ser.name as serviceName FROM visits v INNER JOIN services ser on ser.id = v.serviceId WHERE v.churchId=${churchId} AND v.serviceId=${serviceId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  public async loadByServiceTimeId(churchId: string, serviceTimeId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const rows = await sql<any>`SELECT v.*, st.name as serviceTimeName FROM visits v INNER JOIN visitSessions vs on vs.visitId = v.id INNER JOIN sessions s on s.id = vs.sessionId LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId WHERE v.churchId=${churchId} AND st.id=${serviceTimeId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  public async loadByGroupId(churchId: string, groupId: string, startDate: Date, endDate: Date) {
    const start = DateHelper.toMysqlDate(startDate);
    const end = DateHelper.toMysqlDate(endDate);
    const rows = await sql<any>`SELECT v.* FROM visits v INNER JOIN visitSessions vs on vs.visitId = v.id INNER JOIN sessions s on s.id = vs.sessionId WHERE v.churchId=${churchId} AND s.groupId=${groupId} AND v.visitDate BETWEEN ${start} AND ${end}`.execute(getDb());
    return rows.rows;
  }

  protected rowToModel(data: any): AttendanceRecord {
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

  public convertToModel(_churchId: string, data: any): AttendanceRecord {
    return this.rowToModel(data);
  }

  public convertAllToModel(churchId: string, data: any[]): AttendanceRecord[] {
    return data.map((row) => this.convertToModel(churchId, row));
  }
}
