import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { DateHelper, ArrayHelper } from "@churchapps/apihelper";
import { Visit } from "../models";

import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

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
      (processedVisit as any).visitDate = DateHelper.toMysqlDate(processedVisit.visitDate);
    }
    if (processedVisit.checkinTime) {
      (processedVisit as any).checkinTime = DateHelper.toMysqlDate(processedVisit.checkinTime);
    }
    return super.save(processedVisit);
  }

  public loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    return TypedDB.query("SELECT * FROM visits WHERE churchId=? AND visitDate BETWEEN ? AND ?;", [churchId, DateHelper.toMysqlDate(startDate), DateHelper.toMysqlDate(endDate)]);
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
    const vsDate = DateHelper.toMysqlDate(visitDate);
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
