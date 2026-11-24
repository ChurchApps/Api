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
    const start = model.start ? DateHelper.toMysqlDate(model.start) : model.start;
    const end = model.end ? DateHelper.toMysqlDate(model.end) : model.end;
    const registrationOpenDate = model.registrationOpenDate ? DateHelper.toMysqlDate(model.registrationOpenDate) : model.registrationOpenDate;
    const registrationCloseDate = model.registrationCloseDate ? DateHelper.toMysqlDate(model.registrationCloseDate) : model.registrationCloseDate;
    const resolvedDate = model.resolvedDate ? DateHelper.toMysqlDate(model.resolvedDate) : model.resolvedDate;
    await getDb().insertInto("events").values({
      id: model.id,
      churchId: model.churchId,
      groupId: model.groupId,
      allDay: model.allDay,
      start,
      end,
      title: model.title,
      description: model.description,
      location: model.location || null,
      visibility: model.visibility,
      recurrenceRule: model.recurrenceRule,
      registrationEnabled: model.registrationEnabled,
      capacity: model.capacity,
      waitlistEnabled: model.waitlistEnabled,
      allowSelfCancel: model.allowSelfCancel ?? true,
      allowPayLater: model.allowPayLater ?? false,
      registrationOpenDate,
      registrationCloseDate,
      tags: model.tags,
      formId: model.formId,
      confirmationMessage: EventRepo.confirmationMessage(model) ?? null,
      approvalStatus: model.approvalStatus,
      requestedBy: model.requestedBy,
      resolvedBy: model.resolvedBy,
      resolvedDate,
      rsvpDisabled: model.rsvpDisabled ?? false,
      photoUrl: model.photoUrl,
      notesViewRole: model.notesViewRole || null,
      notesPostRole: model.notesPostRole || null
    }).execute();
    return model;
  }

  private async update(model: Event): Promise<Event> {
    const start = model.start ? DateHelper.toMysqlDate(model.start) : model.start;
    const end = model.end ? DateHelper.toMysqlDate(model.end) : model.end;
    const registrationOpenDate = model.registrationOpenDate ? DateHelper.toMysqlDate(model.registrationOpenDate) : model.registrationOpenDate;
    const registrationCloseDate = model.registrationCloseDate ? DateHelper.toMysqlDate(model.registrationCloseDate) : model.registrationCloseDate;
    const resolvedDate = model.resolvedDate ? DateHelper.toMysqlDate(model.resolvedDate) : model.resolvedDate;
    await getDb().updateTable("events").set({
      groupId: model.groupId,
      allDay: model.allDay,
      start,
      end,
      title: model.title,
      description: model.description,
      // Undefined leaves the stored location alone, so a client that does not send the field keeps it.
      location: model.location === undefined ? undefined : model.location || null,
      visibility: model.visibility,
      recurrenceRule: model.recurrenceRule,
      registrationEnabled: model.registrationEnabled,
      capacity: model.capacity,
      waitlistEnabled: model.waitlistEnabled,
      // Undefined (Kysely drops it) keeps the stored setting for clients that do not send these fields.
      allowSelfCancel: model.allowSelfCancel,
      allowPayLater: model.allowPayLater,
      registrationOpenDate,
      registrationCloseDate,
      tags: model.tags,
      formId: model.formId,
      // Undefined leaves the stored message alone, so the calendar's event dialog (which never sends it) keeps it.
      confirmationMessage: EventRepo.confirmationMessage(model),
      approvalStatus: model.approvalStatus,
      requestedBy: model.requestedBy,
      resolvedBy: model.resolvedBy,
      resolvedDate,
      // explicit false so un-disabling RSVP persists (Kysely drops undefined)
      rsvpDisabled: model.rsvpDisabled ?? false,
      photoUrl: model.photoUrl,
      notesViewRole: model.notesViewRole || null,
      notesPostRole: model.notesPostRole || null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  // Blank clears the message; the column holds at most 2000 characters.
  private static confirmationMessage(model: Event): string | null | undefined {
    if (model.confirmationMessage === undefined) return undefined;
    const message = (model.confirmationMessage || "").trim();
    return message ? message.slice(0, 2000) : null;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("events").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Event | undefined> {
    return (await getDb().selectFrom("events").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll().where("churchId", "=", churchId).orderBy("start").execute();
  }

  public async loadForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("events").selectAll()
      .where("groupId", "=", groupId)
      .where("churchId", "=", churchId)
      .orderBy("start").execute();
  }

  public async loadPublicForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("events").selectAll()
      .where("groupId", "=", groupId)
      .where("churchId", "=", churchId)
      .where("visibility", "=", "public")
      .orderBy("start").execute();
  }

  public async loadByTag(churchId: string, tag: string): Promise<Event[]> {
    const escaped = tag.replace(/[\\%_]/g, (c) => "\\" + c);
    return getDb().selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where("visibility", "=", "public")
      .where("tags", "like", "%" + escaped + "%")
      .orderBy("start").execute();
  }

  // CA-1: the caller's own event requests, newest first, for the "My requests" screen.
  public async loadRequestsForPerson(churchId: string, personId: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where("requestedBy", "=", personId)
      .orderBy("start", "desc").execute();
  }

  public async loadPendingApproval(churchId: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where("approvalStatus", "=", "pending")
      .orderBy("start").execute();
  }

  // Approved and rejected event requests for the approvals history, newest first.
  public async loadResolved(churchId: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where("approvalStatus", "in", ["approved", "rejected"])
      .orderBy("start", "desc").execute();
  }

  // Events with an approved booking for the room, for per-room iCal feeds.
  public async loadForRoom(churchId: string, roomId: string): Promise<Event[]> {
    return getDb().selectFrom("events")
      .innerJoin("eventBookings", "eventBookings.eventId", "events.id")
      .selectAll("events")
      .where("events.churchId", "=", churchId)
      .where("eventBookings.roomId", "=", roomId)
      .where("eventBookings.status", "=", "approved")
      .orderBy("events.start").execute();
  }

  public async loadRegistrationEnabled(churchId: string): Promise<Event[]> {
    return getDb().selectFrom("events").selectAll()
      .where("churchId", "=", churchId)
      .where(sql.ref<number>("registrationEnabled"), "=", 1)
      .orderBy("start").execute();
  }

  private timelineAccess(groupIds: string[]) {
    const ids = groupIds || [];
    return ids.length > 0
      ? sql`(visibility='public' OR groupId IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)}))`
      : sql`visibility='public'`;
  }

  public async loadTimelineGroup(churchId: string, groupId: string, groupIds: string[], eventIds: string[]) {
    let query = sql`select *, 'event' as postType, id as postId from events
      where churchId=${churchId} AND ${this.timelineAccess(groupIds)} AND ((
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
    const ids = groupIds || [];
    const groupFilter = ids.length > 0
      ? sql`groupId IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`
      : sql`0=1`;
    let query = sql`select *, 'event' as postType, id as postId from events
      where churchId=${churchId} AND ${this.timelineAccess(ids)} AND ((
        (
          ${groupFilter}
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

  public convertToModel(_churchId: string, data: Event) { return data; }
  public convertAllToModel(_churchId: string, data: Event[]) { return data || []; }

  protected rowToModel(row: Event): Event {
    return {
      id: row.id,
      churchId: row.churchId,
      groupId: row.groupId,
      allDay: row.allDay,
      start: row.start,
      end: row.end,
      title: row.title,
      description: row.description,
      location: row.location,
      visibility: row.visibility,
      recurrenceRule: row.recurrenceRule,
      registrationEnabled: row.registrationEnabled,
      capacity: row.capacity,
      waitlistEnabled: row.waitlistEnabled,
      allowSelfCancel: row.allowSelfCancel,
      allowPayLater: row.allowPayLater,
      registrationOpenDate: row.registrationOpenDate,
      registrationCloseDate: row.registrationCloseDate,
      tags: row.tags,
      formId: row.formId,
      confirmationMessage: row.confirmationMessage,
      approvalStatus: row.approvalStatus,
      requestedBy: row.requestedBy,
      resolvedBy: row.resolvedBy,
      resolvedDate: row.resolvedDate,
      rsvpDisabled: row.rsvpDisabled,
      photoUrl: row.photoUrl,
      notesViewRole: row.notesViewRole,
      notesPostRole: row.notesPostRole
    };
  }
}
