import { injectable } from "inversify";
import { DB, ConfiguredRepository, type RepoConfig } from "../../../shared/infrastructure";
import { DateHelper, ArrayHelper } from "@churchapps/apihelper";
import { Session } from "../models";

@injectable()
export class SessionRepository extends ConfiguredRepository<Session> {
  protected get repoConfig(): RepoConfig<Session> {
    return {
      tableName: "sessions",
      hasSoftDelete: false,
      defaultOrderBy: "sessionDate DESC",
      insertColumns: ["groupId", "serviceTimeId", "sessionDate"],
      updateColumns: ["groupId", "serviceTimeId", "sessionDate"]
    };
  }

  protected async create(session: Session): Promise<Session> {
    const m: any = session;
    if (!m.id) m.id = this.createId();
    const sessionDate = DateHelper.toMysqlDate(session.sessionDate);
    const sql = "INSERT INTO sessions (id, churchId, groupId, serviceTimeId, sessionDate) VALUES (?, ?, ?, ?, ?);";
    const params = [session.id, session.churchId, session.groupId, session.serviceTimeId, sessionDate];
    await DB.query(sql, params);
    return session;
  }

  protected async update(session: Session): Promise<Session> {
    const sessionDate = DateHelper.toMysqlDate(session.sessionDate);
    const sql = "UPDATE sessions SET groupId=?, serviceTimeId=?, sessionDate=? WHERE id=? and churchId=?";
    const params = [session.groupId, session.serviceTimeId, sessionDate, session.id, session.churchId];
    await DB.query(sql, params);
    return session;
  }

  public async loadByIds(churchId: string, ids: string[]) {
    const result = await DB.query("SELECT * FROM sessions WHERE churchId=? AND id IN (" + ArrayHelper.fillArray("?", ids.length).join(", ") + ");", [churchId].concat(ids));
    return this.convertAllToModel(churchId, result);
  }

  public async loadByGroupServiceTimeDate(churchId: string, groupId: string, serviceTimeId: string, sessionDate: Date) {
    const sessDate = DateHelper.toMysqlDate(sessionDate);
    const result = await DB.queryOne("SELECT * FROM sessions WHERE churchId=? AND groupId = ? AND serviceTimeId = ? AND sessionDate = ?;", [churchId, groupId, serviceTimeId, sessDate]);
    return result ? this.convertToModel(churchId, result) : null;
  }

  public async loadByGroupIdWithNames(churchId: string, groupId: string) {
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
    const result = await DB.query(sql, [churchId, groupId]);
    return this.convertAllToModel(churchId, result);
  }

  protected rowToModel(data: any): Session {
    const result: Session = {
      id: data.id,
      groupId: data.groupId,
      serviceTimeId: data.serviceTimeId,
      sessionDate: data.sessionDate,
      displayName: data.displayName
    };
    return result;
  }
}
