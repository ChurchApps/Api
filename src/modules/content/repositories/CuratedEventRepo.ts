import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { curatedEvents } from "../../../db/schema/content.js";

@injectable()
export class CuratedEventRepo extends DrizzleRepo<typeof curatedEvents> {
  protected readonly table = curatedEvents;
  protected readonly moduleName = "content";

  public deleteByEventId(churchId: string, curatedCalendarId: string, eventId: string) {
    return this.db.delete(curatedEvents).where(and(
      eq(curatedEvents.curatedCalendarId, curatedCalendarId),
      eq(curatedEvents.eventId, eventId),
      eq(curatedEvents.churchId, churchId)
    ));
  }

  public deleteByGroupId(churchId: string, curatedCalendarId: string, groupId: string) {
    return this.db.delete(curatedEvents).where(and(
      eq(curatedEvents.curatedCalendarId, curatedCalendarId),
      eq(curatedEvents.groupId, groupId),
      eq(curatedEvents.churchId, churchId)
    ));
  }

  public loadByCuratedCalendarId(churchId: string, curatedCalendarId: string) {
    return this.db.select().from(curatedEvents).where(and(eq(curatedEvents.churchId, churchId), eq(curatedEvents.curatedCalendarId, curatedCalendarId)));
  }

  public async loadForEvents(curatedCalendarId: string, churchId: string): Promise<any[]> {
    return this.executeRows(sql`
      SELECT ce.id, ce.churchId, ce.curatedCalendarId, ce.groupId as curatedGroupId, ce.eventId,
        e.groupId, e.title, e.description, e.start, e.end, e.allDay, e.recurrenceRule, e.visibility
      FROM curatedEvents ce
      INNER JOIN events e ON
        (CASE
          WHEN ce.eventId IS NULL THEN e.groupId = ce.groupId
          ELSE e.id = ce.eventId
        END)
      WHERE curatedCalendarId = ${curatedCalendarId} AND ce.churchId = ${churchId} AND e.visibility = 'public'
    `);
  }
}
