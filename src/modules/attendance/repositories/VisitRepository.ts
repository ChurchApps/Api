import { DB } from "../../../shared/infrastructure";
import { DateHelper, ArrayHelper } from "@churchapps/apihelper";
import { Visit } from "../models";
import { CollectionHelper } from "../../../shared/helpers";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

export class VisitRepository extends ConfiguredRepository<Visit> {
  protected get repoConfig(): RepoConfig<Visit> {
    return {
      tableName: "visits",
      hasSoftDelete: false,
      insertColumns: ["personId", "serviceId", "groupId", "visitDate", "checkinTime", "addedBy"],
      updateColumns: ["personId", "serviceId", "groupId", "visitDate", "checkinTime", "addedBy"]
    };
  }

  public save(visit: Visit) {
    // Handle date conversion before saving
    const processedVisit = { ...visit };
    if (processedVisit.visitDate) {
      (processedVisit as any).visitDate = DateHelper.toMysqlDate(processedVisit.visitDate);
    }
    if (processedVisit.checkinTime) {
      (processedVisit as any).checkinTime = DateHelper.toMysqlDate(processedVisit.checkinTime);
    }
    return super.save(processedVisit);
  }

  public loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    return DB.query("SELECT * FROM visits WHERE churchId=? AND visitDate BETWEEN ? AND ?;", [churchId, DateHelper.toMysqlDate(startDate), DateHelper.toMysqlDate(endDate)]);
  }

  public loadForSessionPerson(churchId: string, sessionId: string, personId: string) {
    const sql =
      "SELECT v.*" +
      " FROM sessions s" +
      " LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId" +
      " INNER JOIN visits v on(v.serviceId = st.serviceId or v.groupId = s.groupId) and v.visitDate = s.sessionDate" +
      " WHERE v.churchId=? AND s.id = ? AND v.personId=? LIMIT 1";
    return DB.queryOne(sql, [churchId, sessionId, personId]);
  }

  public loadByServiceDatePeopleIds(churchId: string, serviceId: string, visitDate: Date, peopleIds: string[]) {
    const vsDate = DateHelper.toMysqlDate(visitDate);
    const sql = "SELECT * FROM visits WHERE churchId=? AND serviceId = ? AND visitDate = ? AND personId IN (" + ArrayHelper.fillArray("?", peopleIds.length).join(", ") + ")";
    const params = [churchId, serviceId, vsDate].concat(peopleIds);
    return DB.query(sql, params);
  }

  public async loadLastLoggedDate(churchId: string, serviceId: string, peopleIds: string[]) {
    let result = new Date();
    result.setHours(0, 0, 0, 0);

    const sql = "SELECT max(visitDate) as visitDate FROM visits WHERE churchId=? AND serviceId = ? AND personId IN (" + ArrayHelper.fillArray("?", peopleIds.length).join(", ") + ")";
    const params = [churchId, serviceId].concat(peopleIds);
    const data: any = await DB.queryOne(sql, params);

    if (data?.visitDate) result = new Date(data.visitDate);
    return result;
  }

  public loadForPerson(churchId: string, personId: string) {
    return DB.query("SELECT * FROM visits WHERE churchId=? AND personId=?", [churchId, personId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Visit = {
      id: data.id,
      personId: data.personId,
      serviceId: data.serviceId,
      groupId: data.groupId,
      visitDate: data.visitDate,
      checkinTime: data.checkinTime
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Visit>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
