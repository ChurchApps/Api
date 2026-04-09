import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { VisitSession } from "../models/index.js";

@injectable()
export class VisitSessionRepo {
  public async save(model: VisitSession) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: VisitSession): Promise<VisitSession> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("visitSessions").values({
      id: model.id,
      churchId: model.churchId,
      visitId: model.visitId,
      sessionId: model.sessionId
    }).execute();
    return model;
  }

  private async update(model: VisitSession): Promise<VisitSession> {
    await getDb().updateTable("visitSessions").set({
      visitId: model.visitId,
      sessionId: model.sessionId
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("visitSessions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("visitSessions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("visitSessions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadByVisitIdSessionId(churchId: string, visitId: string, sessionId: string) {
    return (await getDb().selectFrom("visitSessions").selectAll()
      .where("churchId", "=", churchId)
      .where("visitId", "=", visitId)
      .where("sessionId", "=", sessionId)
      .limit(1)
      .executeTakeFirst()) ?? null;
  }

  public async loadByVisitIds(churchId: string, visitIds: string[]) {
    if (visitIds.length === 0) return [];
    return getDb().selectFrom("visitSessions").selectAll()
      .where("churchId", "=", churchId)
      .where("visitId", "in", visitIds)
      .execute();
  }

  public async loadByVisitId(churchId: string, visitId: string) {
    return getDb().selectFrom("visitSessions").selectAll()
      .where("churchId", "=", churchId)
      .where("visitId", "=", visitId)
      .execute();
  }

  public async loadForSessionPerson(churchId: string, sessionId: string, personId: string) {
    const rows = await sql<any>`SELECT v.* FROM sessions s LEFT OUTER JOIN serviceTimes st on st.id = s.serviceTimeId INNER JOIN visits v on(v.serviceId = st.serviceId or v.groupId = s.groupId) and v.visitDate = s.sessionDate WHERE v.churchId=${churchId} AND s.id = ${sessionId} AND v.personId=${personId} LIMIT 1`.execute(getDb());
    return rows.rows.length > 0 ? rows.rows[0] : null;
  }

  public async loadForSession(churchId: string, sessionId: string) {
    const rows = await sql<any>`SELECT vs.*, v.personId FROM visitSessions vs INNER JOIN visits v on v.id = vs.visitId WHERE vs.churchId=${churchId} AND vs.sessionId = ${sessionId}`.execute(getDb());
    return rows.rows.map((row: any) => this.rowToModel(row));
  }

  public convertToModel(_churchId: string, data: any): VisitSession {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]): VisitSession[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(row: any): VisitSession {
    const result: VisitSession = { id: row.id, visitId: row.visitId, sessionId: row.sessionId };
    if (row.personId !== undefined) {
      result.visit = { id: result.visitId, personId: row.personId };
    }
    return result;
  }
}
