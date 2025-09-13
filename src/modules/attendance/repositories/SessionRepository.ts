import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { DateHelper, ArrayHelper } from "@churchapps/apihelper";
import { Session } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper } from "../../../shared/helpers";

@injectable()
export class SessionRepository {
  public save(session: Session) {
    return session.id ? this.update(session) : this.create(session);
  }

  private async create(session: Session) {
    session.id = UniqueIdHelper.shortId();
    const sessionDate = DateHelper.toMysqlDate(session.sessionDate);
    const sql = "INSERT INTO sessions (id, churchId, groupId, serviceTimeId, sessionDate) VALUES (?, ?, ?, ?, ?);";
    const params = [session.id, session.churchId, session.groupId, session.serviceTimeId, sessionDate];
    await DB.query(sql, params);
    return session;
  }

  private async update(session: Session) {
    const sessionDate = DateHelper.toMysqlDate(session.sessionDate);
    const sql = "UPDATE sessions SET groupId=?, serviceTimeId=?, sessionDate=? WHERE id=? and churchId=?";
    const params = [session.groupId, session.serviceTimeId, sessionDate, session.id, session.churchId];
    await DB.query(sql, params);
    return session;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM sessions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM sessions WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadByIds(churchId: string, ids: string[]) {
    return DB.query("SELECT * FROM sessions WHERE churchId=? AND id IN (" + ArrayHelper.fillArray("?", ids.length).join(", ") + ");", [churchId].concat(ids));
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM sessions WHERE churchId=?;", [churchId]);
  }

  public loadByGroupServiceTimeDate(churchId: string, groupId: string, serviceTimeId: string, sessionDate: Date) {
    const sessDate = DateHelper.toMysqlDate(sessionDate);
    return DB.queryOne("SELECT * FROM sessions WHERE churchId=? AND groupId = ? AND serviceTimeId = ? AND sessionDate = ?;", [churchId, groupId, serviceTimeId, sessDate]);
  }

  public loadByGroupIdWithNames(churchId: string, groupId: string) {
    const sql =
      "select s.id, " +
      " CASE" +
      "     WHEN st.name IS NULL THEN DATE_FORMAT(sessionDate, '%m/%d/%Y')" +
      "     ELSE concat(DATE_FORMAT(sessionDate, '%m/%d/%Y'), ' - ', st.name)" +
      " END AS displayName" +
      " FROM sessions s" +
      " LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId" +
      " WHERE s.churchId=? AND s.groupId=?" +
      " ORDER by s.sessionDate desc";
    return DB.query(sql, [churchId, groupId]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Session = {
      id: data.id,
      groupId: data.groupId,
      serviceTimeId: data.serviceTimeId,
      sessionDate: data.sessionDate,
      displayName: data.displayName
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<Session>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
