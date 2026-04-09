import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { getDb } from "../db/index.js";
import { Session } from "../models/index.js";

@injectable()
export class SessionRepo {
  public async save(model: Session) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(session: Session): Promise<Session> {
    session.id = UniqueIdHelper.shortId();
    const sessionDate = DateHelper.toMysqlDateOnly(session.sessionDate);
    await getDb().insertInto("sessions").values({
      id: session.id,
      churchId: session.churchId,
      groupId: session.groupId,
      serviceTimeId: session.serviceTimeId,
      sessionDate: sessionDate as any
    }).execute();
    return session;
  }

  private async update(session: Session): Promise<Session> {
    const sessionDate = DateHelper.toMysqlDateOnly(session.sessionDate);
    await getDb().updateTable("sessions").set({
      groupId: session.groupId,
      serviceTimeId: session.serviceTimeId,
      sessionDate: sessionDate as any
    }).where("id", "=", session.id)
      .where("churchId", "=", session.churchId)
      .execute();
    return session;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("sessions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("sessions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("sessions").selectAll().where("churchId", "=", churchId).orderBy("sessionDate", "desc").execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return getDb().selectFrom("sessions").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async loadByGroupServiceTimeDate(churchId: string, groupId: string, serviceTimeId: string, sessionDate: Date) {
    const sessDate = DateHelper.toMysqlDateOnly(sessionDate);
    const row = await sql<any>`SELECT * FROM sessions WHERE churchId=${churchId} AND groupId = ${groupId} AND serviceTimeId = ${serviceTimeId} AND sessionDate = ${sessDate}`.execute(getDb());
    return row.rows.length > 0 ? this.rowToModel(row.rows[0]) : null;
  }

  public async loadByGroupIdWithNames(churchId: string, groupId: string) {
    const rows = await sql<any>`select s.id, CASE WHEN st.name IS NULL THEN DATE_FORMAT(sessionDate, '%m/%d/%Y') ELSE concat(DATE_FORMAT(sessionDate, '%m/%d/%Y'), ' - ', st.name) END AS displayName FROM sessions s LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId WHERE s.churchId=${churchId} AND s.groupId=${groupId} ORDER by s.sessionDate desc`.execute(getDb());
    return rows.rows;
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]): Session[] {
    return data.map((row) => this.rowToModel(row));
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
