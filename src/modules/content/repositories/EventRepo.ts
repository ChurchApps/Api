import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Event } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class EventRepo {
  public async save(model: Event) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Event): Promise<Event> {
    model.id = UniqueIdHelper.shortId();
    const m: any = { ...model };
    if (m.start) m.start = DateHelper.toMysqlDate(m.start);
    if (m.end) m.end = DateHelper.toMysqlDate(m.end);
    if (m.registrationOpenDate) m.registrationOpenDate = DateHelper.toMysqlDate(m.registrationOpenDate);
    if (m.registrationCloseDate) m.registrationCloseDate = DateHelper.toMysqlDate(m.registrationCloseDate);
    await getDb().insertInto("events").values({
      id: model.id,
      churchId: model.churchId,
      groupId: m.groupId,
      allDay: m.allDay,
      start: m.start,
      end: m.end,
      title: m.title,
      description: m.description,
      visibility: m.visibility,
      recurrenceRule: m.recurrenceRule,
      registrationEnabled: m.registrationEnabled,
      capacity: m.capacity,
      registrationOpenDate: m.registrationOpenDate,
      registrationCloseDate: m.registrationCloseDate,
      tags: m.tags,
      formId: m.formId
    } as any).execute();
    return model;
  }

  private async update(model: Event): Promise<Event> {
    const m: any = { ...model };
    if (m.start) m.start = DateHelper.toMysqlDate(m.start);
    if (m.end) m.end = DateHelper.toMysqlDate(m.end);
    if (m.registrationOpenDate) m.registrationOpenDate = DateHelper.toMysqlDate(m.registrationOpenDate);
    if (m.registrationCloseDate) m.registrationCloseDate = DateHelper.toMysqlDate(m.registrationCloseDate);
    await getDb().updateTable("events").set({
      groupId: m.groupId,
      allDay: m.allDay,
      start: m.start,
      end: m.end,
      title: m.title,
      description: m.description,
      visibility: m.visibility,
      recurrenceRule: m.recurrenceRule,
      registrationEnabled: m.registrationEnabled,
      capacity: m.capacity,
      registrationOpenDate: m.registrationOpenDate,
      registrationCloseDate: m.registrationCloseDate,
      tags: m.tags,
      formId: m.formId
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("events").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Event | undefined> {
    return (await getDb().selectFrom("events").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll().where("churchId", "=", churchId).orderBy("start").execute() as any;
  }

  public async loadForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("events").selectAll()
      .where("groupId", "=", groupId)
      .where("churchId", "=", churchId)
      .orderBy("start").execute() as any;
  }

  public async loadPublicForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("events").selectAll()
      .where("groupId", "=", groupId)
      .where("churchId", "=", churchId)
      .where("visibility", "=", "public")
      .orderBy("start").execute() as any;
  }

  public async loadByTag(churchId: string, tag: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where("tags", "like", "%" + tag + "%")
      .orderBy("start").execute() as any;
  }

  public async loadRegistrationEnabled(churchId: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where("registrationEnabled", "=", 1 as any)
      .orderBy("start").execute() as any;
  }

  public async loadTimelineGroup(churchId: string, groupId: string, eventIds: string[]) {
    let query = sql`select *, 'event' as postType, id as postId from events
      where churchId=${churchId} AND ((
        groupId = ${groupId}
        and (end>curdate() or recurrenceRule IS NOT NULL)
      )`;
    if (eventIds.length > 0) {
      query = sql`${query} OR id IN (${sql.join(eventIds.map(id => sql`${id}`), sql`,`)})`;
    }
    query = sql`${query})`;
    const result = await query.execute(getDb());
    return result.rows;
  }

  public async loadTimeline(churchId: string, groupIds: string[], eventIds: string[]) {
    let query = sql`select *, 'event' as postType, id as postId from events
      where churchId=${churchId} AND ((
        (
          groupId IN (${sql.join(groupIds.map(id => sql`${id}`), sql`,`)})
          OR groupId IN (SELECT groupId FROM curatedEvents WHERE churchId=${churchId} AND eventId IS NULL)
          OR id IN (SELECT eventId from curatedEvents WHERE churchId=${churchId})
        )
        and (end>curdate() or recurrenceRule IS NOT NULL)
      )`;
    if (eventIds.length > 0) {
      query = sql`${query} OR id IN (${sql.join(eventIds.map(id => sql`${id}`), sql`,`)})`;
    }
    query = sql`${query})`;
    const result = await query.execute(getDb());
    return result.rows;
  }

  public convertToModel(_churchId: string, data: any) { return data as Event; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Event[]; }

  protected rowToModel(row: any): Event {
    return {
      id: row.id,
      churchId: row.churchId,
      groupId: row.groupId,
      allDay: row.allDay,
      start: row.start,
      end: row.end,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      recurrenceRule: row.recurrenceRule,
      registrationEnabled: row.registrationEnabled,
      capacity: row.capacity,
      registrationOpenDate: row.registrationOpenDate,
      registrationCloseDate: row.registrationCloseDate,
      tags: row.tags,
      formId: row.formId
    };
  }
}
