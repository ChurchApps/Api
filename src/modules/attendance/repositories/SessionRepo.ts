import { injectable } from "inversify";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { sessions } from "../../../db/schema/attendance.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { Session } from "../models/index.js";

/**
 * Normalize a date-only value to midnight UTC Date.
 * Drizzle datetime columns require Date objects. For date-only fields (sessionDate),
 * we normalize to midnight UTC so raw SQL comparisons with date strings match.
 */
function toDateOnly(val: any): Date | null {
  if (val == null) return null;
  const str = typeof val === "string" ? val : DateHelper.toMysqlDateOnly(val);
  if (!str) return null;
  return new Date(str + "T00:00:00Z");
}

@injectable()
export class SessionRepo extends DrizzleRepo<typeof sessions> {
  protected readonly table = sessions;
  protected readonly moduleName = "attendance";

  public override async save(session: Session) {
    if (session.id) {
      await this.db.update(sessions).set({
        groupId: session.groupId,
        serviceTimeId: session.serviceTimeId,
        sessionDate: toDateOnly(session.sessionDate) as any
      }).where(and(eq(sessions.id, session.id!), eq(sessions.churchId, session.churchId!)));
    } else {
      session.id = UniqueIdHelper.shortId();
      const data = { ...session } as any;
      data.sessionDate = toDateOnly(session.sessionDate);
      await this.db.insert(sessions).values(data);
    }
    return session;
  }

  public override loadAll(churchId: string) {
    return this.db.select().from(sessions).where(eq(sessions.churchId, churchId)).orderBy(desc(sessions.sessionDate));
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const result = await this.db.select().from(sessions)
      .where(and(eq(sessions.churchId, churchId), inArray(sessions.id, ids)));
    return this.convertAllToModel(churchId, result);
  }

  public async loadByGroupServiceTimeDate(churchId: string, groupId: string, serviceTimeId: string, sessionDate: Date) {
    const normalizedDate = toDateOnly(sessionDate);
    const rows = await this.db.select().from(sessions)
      .where(and(
        eq(sessions.churchId, churchId),
        eq(sessions.groupId, groupId),
        eq(sessions.serviceTimeId, serviceTimeId),
        eq(sessions.sessionDate, normalizedDate!)
      ));
    return rows.length > 0 ? this.convertToModel(churchId, rows[0]) : null;
  }

  public async loadByGroupIdWithNames(churchId: string, groupId: string) {
    const rows = await this.executeRows(sql`
      SELECT s.id,
        CASE
          WHEN st.name IS NULL THEN DATE_FORMAT(sessionDate, '%m/%d/%Y')
          ELSE concat(DATE_FORMAT(sessionDate, '%m/%d/%Y'), ' - ', st.name)
        END AS displayName
      FROM sessions s
      LEFT OUTER JOIN serviceTimes st ON st.id = s.serviceTimeId
      WHERE s.churchId = ${churchId} AND s.groupId = ${groupId}
      ORDER BY s.sessionDate DESC
    `);
    return this.convertAllToModel(churchId, rows);
  }

  public convertToModel(_churchId: string, data: any): Session {
    return { id: data.id, groupId: data.groupId, serviceTimeId: data.serviceTimeId, sessionDate: data.sessionDate, displayName: data.displayName };
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
