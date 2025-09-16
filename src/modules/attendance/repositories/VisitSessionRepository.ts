import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { ArrayHelper } from "@churchapps/apihelper";
import { VisitSession } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class VisitSessionRepository extends ConfiguredRepository<VisitSession> {
  protected get repoConfig(): RepoConfig<VisitSession> {
    return {
      tableName: "visitSessions",
      hasSoftDelete: false,
      insertColumns: ["visitId", "sessionId"],
      updateColumns: ["visitId", "sessionId"]
    };
  }

  public loadByVisitIdSessionId(churchId: string, visitId: string, sessionId: string) {
    return TypedDB.queryOne("SELECT * FROM visitSessions WHERE churchId=? AND visitId=? AND sessionId=? LIMIT 1;", [churchId, visitId, sessionId]);
  }

  public loadByVisitIds(churchId: string, visitIds: string[]) {
    return TypedDB.query("SELECT * FROM visitSessions WHERE churchId=? AND visitId IN (" + ArrayHelper.fillArray("?", visitIds.length).join(", ") + ");", [churchId].concat(visitIds));
  }

  public loadByVisitId(churchId: string, visitId: string) {
    return TypedDB.query("SELECT * FROM visitSessions WHERE churchId=? AND visitId=?;", [churchId, visitId]);
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

  public loadForSession(churchId: string, sessionId: string) {
    const sql = "SELECT vs.*, v.personId FROM" + " visitSessions vs" + " INNER JOIN visits v on v.id = vs.visitId" + " WHERE vs.churchId=? AND vs.sessionId = ?";
    return TypedDB.query(sql, [churchId, sessionId]);
  }

  protected rowToModel(row: any): VisitSession {
    const result: VisitSession = { id: row.id, visitId: row.visitId, sessionId: row.sessionId };
    if (row.personId !== undefined) {
      result.visit = { id: result.visitId, personId: row.personId };
    }
    return result;
  }
}
