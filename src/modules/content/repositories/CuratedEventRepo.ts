import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { CuratedEvent } from "../models/index.js";

@injectable()
export class CuratedEventRepo {
  public async save(model: CuratedEvent) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: CuratedEvent): Promise<CuratedEvent> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("curatedEvents").values({
      id: model.id,
      churchId: model.churchId,
      curatedCalendarId: model.curatedCalendarId,
      groupId: model.groupId,
      eventId: model.eventId
    } as any).execute();
    return model;
  }

  private async update(model: CuratedEvent): Promise<CuratedEvent> {
    await getDb().updateTable("curatedEvents").set({
      curatedCalendarId: model.curatedCalendarId,
      groupId: model.groupId,
      eventId: model.eventId
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("curatedEvents").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<CuratedEvent | undefined> {
    return (await getDb().selectFrom("curatedEvents").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<CuratedEvent[]> {
    return getDb().selectFrom("curatedEvents").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async deleteByEventId(churchId: string, curatedCalendarId: string, eventId: string) {
    await getDb().deleteFrom("curatedEvents")
      .where("curatedCalendarId", "=", curatedCalendarId)
      .where("eventId", "=", eventId)
      .where("churchId", "=", churchId).execute();
  }

  public async deleteByGroupId(churchId: string, curatedCalendarId: string, groupId: string) {
    await getDb().deleteFrom("curatedEvents")
      .where("curatedCalendarId", "=", curatedCalendarId)
      .where("groupId", "=", groupId)
      .where("churchId", "=", churchId).execute();
  }

  public async loadByCuratedCalendarId(churchId: string, curatedCalendarId: string) {
    return getDb().selectFrom("curatedEvents").selectAll()
      .where("churchId", "=", churchId)
      .where("curatedCalendarId", "=", curatedCalendarId).execute() as any;
  }

  public async loadForEvents(curatedCalendarId: string, churchId: string) {
    const result = await getDb().selectFrom("curatedEvents as ce")
      .innerJoin("events as e", (join) =>
        join.on((eb) =>
          eb.or([
            eb.and([eb("ce.eventId", "is", null), eb("e.groupId", "=", eb.ref("ce.groupId"))]),
            eb.and([eb("ce.eventId", "is not", null), eb("e.id", "=", eb.ref("ce.eventId"))])
          ])
        )
      )
      .select([
        "ce.id", "ce.churchId", "ce.curatedCalendarId",
        sql`ce.groupId`.as("curatedGroupId"),
        "ce.eventId",
        "e.groupId", "e.title", "e.description", "e.start", "e.end",
        "e.allDay", "e.recurrenceRule", "e.visibility"
      ])
      .where("ce.curatedCalendarId", "=", curatedCalendarId)
      .where("ce.churchId", "=", churchId)
      .where("e.visibility", "=", "public")
      .execute();
    return result;
  }

  public convertToModel(_churchId: string, data: any) { return data as CuratedEvent; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as CuratedEvent[]; }

  protected rowToModel(row: any): CuratedEvent {
    return {
      id: row.id,
      churchId: row.churchId,
      curatedCalendarId: row.curatedCalendarId,
      groupId: row.groupId,
      eventId: row.eventId
    };
  }
}
