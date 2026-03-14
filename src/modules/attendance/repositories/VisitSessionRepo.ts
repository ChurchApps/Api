import { injectable } from "inversify";
import { eq, and, sql, inArray } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { visitSessions, sessions, serviceTimes, visits } from "../../../db/schema/attendance.js";
import { VisitSession } from "../models/index.js";

@injectable()
export class VisitSessionRepo extends DrizzleRepo<typeof visitSessions> {
  protected readonly table = visitSessions;
  protected readonly moduleName = "attendance";

  public async loadByVisitIdSessionId(churchId: string, visitId: string, sessionId: string) {
    const rows = await this.db.select().from(visitSessions)
      .where(and(eq(visitSessions.churchId, churchId), eq(visitSessions.visitId, visitId), eq(visitSessions.sessionId, sessionId)))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  public loadByVisitIds(churchId: string, visitIds: string[]) {
    if (visitIds.length === 0) return Promise.resolve([]);
    return this.db.select().from(visitSessions)
      .where(and(eq(visitSessions.churchId, churchId), inArray(visitSessions.visitId, visitIds)));
  }

  public loadByVisitId(churchId: string, visitId: string) {
    return this.db.select().from(visitSessions)
      .where(and(eq(visitSessions.churchId, churchId), eq(visitSessions.visitId, visitId)));
  }

  public async loadForSessionPerson(churchId: string, sessionId: string, personId: string) {
    const rows = await this.executeRows(sql`
      SELECT ${visits}.*
      FROM ${sessions}
      LEFT OUTER JOIN ${serviceTimes} ON ${serviceTimes.id} = ${sessions.serviceTimeId}
      INNER JOIN ${visits} ON (${visits.serviceId} = ${serviceTimes.serviceId} OR ${visits.groupId} = ${sessions.groupId}) AND ${visits.visitDate} = ${sessions.sessionDate}
      WHERE ${visits.churchId} = ${churchId} AND ${sessions.id} = ${sessionId} AND ${visits.personId} = ${personId} LIMIT 1
    `);
    return rows.length > 0 ? rows[0] : null;
  }

  public async loadForSession(churchId: string, sessionId: string) {
    return this.executeRows(sql`
      SELECT ${visitSessions}.*, ${visits.personId}
      FROM ${visitSessions}
      INNER JOIN ${visits} ON ${visits.id} = ${visitSessions.visitId}
      WHERE ${visitSessions.churchId} = ${churchId} AND ${visitSessions.sessionId} = ${sessionId}
    `);
  }

  public convertToModel(_churchId: string, row: any): VisitSession {
    const result: VisitSession = { id: row.id, visitId: row.visitId, sessionId: row.sessionId };
    if (row.personId !== undefined) {
      result.visit = { id: result.visitId, personId: row.personId };
    }
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
