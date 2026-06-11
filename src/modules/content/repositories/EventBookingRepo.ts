import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { EventBooking } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class EventBookingRepo {
  public async save(model: EventBooking) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: EventBooking): Promise<EventBooking> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("eventBookings").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      roomId: model.roomId,
      resourceId: model.resourceId,
      quantity: model.quantity,
      status: model.status,
      requestedBy: model.requestedBy,
      requestedDate: model.requestedDate ? DateHelper.toMysqlDate(model.requestedDate) : null,
      resolvedBy: model.resolvedBy,
      resolvedDate: model.resolvedDate ? DateHelper.toMysqlDate(model.resolvedDate) : null,
      notifiedDate: model.notifiedDate ? DateHelper.toMysqlDate(model.notifiedDate) : null
    } as any).execute();
    return model;
  }

  private async update(model: EventBooking): Promise<EventBooking> {
    await getDb().updateTable("eventBookings").set({
      quantity: model.quantity,
      status: model.status,
      resolvedBy: model.resolvedBy,
      resolvedDate: model.resolvedDate ? DateHelper.toMysqlDate(model.resolvedDate) : null,
      notifiedDate: model.notifiedDate ? DateHelper.toMysqlDate(model.notifiedDate) : null
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("eventBookings").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteForEvent(churchId: string, eventId: string) {
    await getDb().deleteFrom("eventBookings").where("eventId", "=", eventId).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<EventBooking | undefined> {
    return (await getDb().selectFrom("eventBookings").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<any[]> {
    return getDb().selectFrom("eventBookings")
      .leftJoin("rooms", "rooms.id", "eventBookings.roomId")
      .leftJoin("resources", "resources.id", "eventBookings.resourceId")
      .selectAll("eventBookings")
      .select(["rooms.name as roomName", "resources.name as resourceName"])
      .where("eventBookings.churchId", "=", churchId)
      .where("eventBookings.eventId", "=", eventId)
      .execute() as any;
  }

  public async loadPending(churchId: string): Promise<any[]> {
    return getDb().selectFrom("eventBookings")
      .innerJoin("events", "events.id", "eventBookings.eventId")
      .leftJoin("rooms", "rooms.id", "eventBookings.roomId")
      .leftJoin("resources", "resources.id", "eventBookings.resourceId")
      .selectAll("eventBookings")
      .select([
        "events.title as eventTitle",
        "events.start as eventStart",
        "events.end as eventEnd",
        "events.recurrenceRule as eventRecurrenceRule",
        "rooms.name as roomName",
        "rooms.approvalGroupId as roomApprovalGroupId",
        "resources.name as resourceName",
        "resources.approvalGroupId as resourceApprovalGroupId"
      ])
      .where("eventBookings.churchId", "=", churchId)
      .where("eventBookings.status", "=", "pending")
      .orderBy("eventBookings.requestedDate")
      .execute() as any;
  }

  // Non-rejected bookings for any of the rooms, joined with their event's schedule, for conflict checks.
  public async loadActiveForRooms(churchId: string, roomIds: string[], excludeEventId?: string): Promise<any[]> {
    if (roomIds.length === 0) return [];
    let query = getDb().selectFrom("eventBookings")
      .innerJoin("events", "events.id", "eventBookings.eventId")
      .selectAll("eventBookings")
      .select(["events.title as eventTitle", "events.start as eventStart", "events.end as eventEnd", "events.recurrenceRule as eventRecurrenceRule"])
      .where("eventBookings.churchId", "=", churchId)
      .where("eventBookings.roomId", "in", roomIds)
      .where("eventBookings.status", "!=", "rejected");
    if (excludeEventId) query = query.where("eventBookings.eventId", "!=", excludeEventId);
    return query.execute() as any;
  }

  public async loadActiveForResources(churchId: string, resourceIds: string[], excludeEventId?: string): Promise<any[]> {
    if (resourceIds.length === 0) return [];
    let query = getDb().selectFrom("eventBookings")
      .innerJoin("events", "events.id", "eventBookings.eventId")
      .selectAll("eventBookings")
      .select(["events.title as eventTitle", "events.start as eventStart", "events.end as eventEnd", "events.recurrenceRule as eventRecurrenceRule"])
      .where("eventBookings.churchId", "=", churchId)
      .where("eventBookings.resourceId", "in", resourceIds)
      .where("eventBookings.status", "!=", "rejected");
    if (excludeEventId) query = query.where("eventBookings.eventId", "!=", excludeEventId);
    return query.execute() as any;
  }

  // Cross-church: pending bookings never included in a digest, joined with the
  // approval group that owns them. Used by the 30-minute timer.
  public async loadUnnotifiedPending(): Promise<any[]> {
    return getDb().selectFrom("eventBookings")
      .innerJoin("events", "events.id", "eventBookings.eventId")
      .leftJoin("rooms", "rooms.id", "eventBookings.roomId")
      .leftJoin("resources", "resources.id", "eventBookings.resourceId")
      .selectAll("eventBookings")
      .select([
        "events.title as eventTitle",
        "events.start as eventStart",
        "rooms.name as roomName",
        "rooms.approvalGroupId as roomApprovalGroupId",
        "resources.name as resourceName",
        "resources.approvalGroupId as resourceApprovalGroupId"
      ])
      .where("eventBookings.status", "=", "pending")
      .where("eventBookings.notifiedDate", "is", null)
      .execute() as any;
  }

  public async markNotified(ids: string[]) {
    if (ids.length === 0) return;
    await getDb().updateTable("eventBookings").set({ notifiedDate: DateHelper.toMysqlDate(new Date()) } as any).where("id", "in", ids).execute();
  }

  public convertToModel(_churchId: string, data: any) { return data as EventBooking; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as EventBooking[]; }
}
