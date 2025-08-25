import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { ArrayHelper } from "@churchapps/apihelper";
import { VisitSession } from "../models";
import { UniqueIdHelper } from "../../../shared/helpers";

@injectable()
export class VisitSessionRepository {
  public save(visitSession: VisitSession) {
    return visitSession.id ? this.update(visitSession) : this.create(visitSession);
  }

  private async create(visitSession: VisitSession) {
    visitSession.id = UniqueIdHelper.shortId();
    const sql = "INSERT INTO visitSessions (id, churchId, visitId, sessionId) VALUES (?, ?, ?, ?);";
    const params = [visitSession.id, visitSession.churchId, visitSession.visitId, visitSession.sessionId];
    await DB.query(sql, params);
    return visitSession;
  }

  private async update(visitSession: VisitSession) {
    const sql = "UPDATE visitSessions SET visitId=?, sessionId=? WHERE id=? and churchId=?";
    const params = [visitSession.visitId, visitSession.sessionId, visitSession.id, visitSession.churchId];
    await DB.query(sql, params);
    return visitSession;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM visitSessions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM visitSessions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM visitSessions WHERE churchId=?;", [churchId]);
  }

  public loadByVisitIdSessionId(churchId: string, visitId: string, sessionId: string) {
    return DB.queryOne("SELECT * FROM visitSessions WHERE churchId=? AND visitId=? AND sessionId=? LIMIT 1;", [churchId, visitId, sessionId]);
  }

  public loadByVisitIds(churchId: string, visitIds: string[]) {
    return DB.query("SELECT * FROM visitSessions WHERE churchId=? AND visitId IN (" + ArrayHelper.fillArray("?", visitIds.length).join(", ") + ");", [churchId].concat(visitIds));
  }

  public loadByVisitId(churchId: string, visitId: string) {
    return DB.query("SELECT * FROM visitSessions WHERE churchId=? AND visitId=?;", [churchId, visitId]);
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

  public loadForSession(churchId: string, sessionId: string) {
    const sql = "SELECT vs.*, v.personId FROM" + " visitSessions vs" + " INNER JOIN visits v on v.id = vs.visitId" + " WHERE vs.churchId=? AND vs.sessionId = ?";
    return DB.query(sql, [churchId, sessionId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: VisitSession = { id: data.id, visitId: data.visitId, sessionId: data.sessionId };
    if (data.personId !== undefined) {
      result.visit = { id: result.visitId, personId: data.personId };
    }
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    const result: VisitSession[] = [];
    data.forEach((d) => result.push(this.convertToModel(churchId, d)));
    return result;
  }
}
