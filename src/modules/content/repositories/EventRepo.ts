import { injectable } from "inversify";
import { eq, and, asc, like, sql } from "drizzle-orm";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { events } from "../../../db/schema/content.js";
import { getDialect } from "../../../shared/helpers/Dialect.js";

@injectable()
export class EventRepo extends DrizzleRepo<typeof events> {
  protected readonly table = events;
  protected readonly moduleName = "content";

  public override async loadAll(churchId: string) {
    return this.db.select().from(events).where(eq(events.churchId, churchId)).orderBy(asc(events.start));
  }

  public loadForGroup(churchId: string, groupId: string) {
    return this.db.select().from(events).where(and(eq(events.groupId, groupId), eq(events.churchId, churchId))).orderBy(asc(events.start));
  }

  public loadPublicForGroup(churchId: string, groupId: string) {
    return this.db.select().from(events).where(and(eq(events.groupId, groupId), eq(events.churchId, churchId), eq(events.visibility, "public"))).orderBy(asc(events.start));
  }

  public async loadByTag(churchId: string, tag: string) {
    return this.db.select().from(events).where(and(eq(events.churchId, churchId), like(events.tags, "%" + tag + "%"))).orderBy(asc(events.start));
  }

  public async loadRegistrationEnabled(churchId: string) {
    return this.db.select().from(events).where(and(eq(events.churchId, churchId), eq(events.registrationEnabled, true))).orderBy(asc(events.start));
  }

  public async loadTimelineGroup(churchId: string, groupId: string, eventIds: string[]): Promise<any[]> {
    const eventIdPlaceholders = eventIds.length > 0 ? sql` OR id IN (${sql.join(eventIds.map(id => sql`${id}`), sql`, `)})` : sql``;
    if (getDialect() === "postgres") {
      return this.executeRows(sql`
        SELECT *, 'event' as "postType", id as "postId" FROM events
        WHERE "churchId" = ${churchId} AND ((
          "groupId" = ${groupId}
          AND ("end" > ${DateHelper.startOfToday()} OR "recurrenceRule" IS NOT NULL)
        )${eventIdPlaceholders})
      `);
    }
    return this.executeRows(sql`
      SELECT *, 'event' as postType, id as postId FROM events
      WHERE churchId = ${churchId} AND ((
        groupId = ${groupId}
        AND (end > ${DateHelper.startOfToday()} OR recurrenceRule IS NOT NULL)
      )${eventIdPlaceholders})
    `);
  }

  public async loadTimeline(churchId: string, groupIds: string[], eventIds: string[]): Promise<any[]> {
    const groupIdPlaceholders = sql.join(groupIds.map(id => sql`${id}`), sql`, `);
    const eventIdFragment = eventIds.length > 0 ? sql` OR id IN (${sql.join(eventIds.map(id => sql`${id}`), sql`, `)})` : sql``;
    if (getDialect() === "postgres") {
      return this.executeRows(sql`
        SELECT *, 'event' as "postType", id as "postId" FROM events
        WHERE "churchId" = ${churchId} AND ((
          (
            "groupId" IN (${groupIdPlaceholders})
            OR "groupId" IN (SELECT "groupId" FROM "curatedEvents" WHERE "churchId" = ${churchId} AND "eventId" IS NULL)
            OR id IN (SELECT "eventId" FROM "curatedEvents" WHERE "churchId" = ${churchId})
          )
          AND ("end" > ${DateHelper.startOfToday()} OR "recurrenceRule" IS NOT NULL)
        )${eventIdFragment})
      `);
    }
    return this.executeRows(sql`
      SELECT *, 'event' as postType, id as postId FROM events
      WHERE churchId = ${churchId} AND ((
        (
          groupId IN (${groupIdPlaceholders})
          OR groupId IN (SELECT groupId FROM curatedEvents WHERE churchId = ${churchId} AND eventId IS NULL)
          OR id IN (SELECT eventId FROM curatedEvents WHERE churchId = ${churchId})
        )
        AND (end > ${DateHelper.startOfToday()} OR recurrenceRule IS NOT NULL)
      )${eventIdFragment})
    `);
  }
}
