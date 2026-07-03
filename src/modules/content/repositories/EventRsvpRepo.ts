import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { EventRsvp } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class EventRsvpRepo {
  // Upsert on the natural key (churchId, eventId, personId, occurrenceStart) so a
  // member changing their response updates the row rather than duplicating it.
  public async save(model: EventRsvp): Promise<EventRsvp> {
    const existing = await this.loadOwn(model.churchId, model.eventId, model.personId, model.occurrenceStart);
    if (existing) {
      model.id = existing.id;
      await getDb().updateTable("eventRsvps").set({
        response: model.response,
        timeUpdated: sql`NOW()`
      } as any).where("id", "=", existing.id).where("churchId", "=", model.churchId).execute();
      return model;
    }
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("eventRsvps").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      personId: model.personId,
      occurrenceStart: DateHelper.toMysqlDate(model.occurrenceStart),
      response: model.response,
      timeAdded: sql`NOW()`,
      timeUpdated: sql`NOW()`
    } as any).execute();
    return model;
  }

  public async loadOwn(churchId: string, eventId: string, personId: string, occurrenceStart: Date): Promise<EventRsvp | null> {
    return (await getDb().selectFrom("eventRsvps").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("personId", "=", personId)
      .where("occurrenceStart", "=", DateHelper.toMysqlDate(occurrenceStart) as any)
      .executeTakeFirst()) ?? null;
  }

  public async deleteOwn(churchId: string, eventId: string, personId: string, occurrenceStart: Date) {
    await getDb().deleteFrom("eventRsvps")
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("personId", "=", personId)
      .where("occurrenceStart", "=", DateHelper.toMysqlDate(occurrenceStart) as any)
      .execute();
  }

  public async loadForOccurrence(churchId: string, eventId: string, occurrenceStart: Date) {
    return getDb().selectFrom("eventRsvps")
      .select(["id", "personId", "response", "occurrenceStart"])
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("occurrenceStart", "=", DateHelper.toMysqlDate(occurrenceStart) as any)
      .execute();
  }

  // Every RSVP row for the group's events within the window, for batch calendar
  // rendering; the controller aggregates counts + the caller's own response.
  public async loadForGroupWindow(churchId: string, groupId: string, from: Date, to: Date) {
    return getDb().selectFrom("eventRsvps")
      .innerJoin("events", "events.id", "eventRsvps.eventId")
      .select(["eventRsvps.eventId as eventId", "eventRsvps.occurrenceStart as occurrenceStart", "eventRsvps.personId as personId", "eventRsvps.response as response"])
      .where("eventRsvps.churchId", "=", churchId)
      .where("events.groupId", "=", groupId)
      .where("eventRsvps.occurrenceStart", ">=", DateHelper.toMysqlDate(from) as any)
      .where("eventRsvps.occurrenceStart", "<=", DateHelper.toMysqlDate(to) as any)
      .execute();
  }

  public convertToModel(_churchId: string, data: any) { return data as EventRsvp; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as EventRsvp[]; }
}
