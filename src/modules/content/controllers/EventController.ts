import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import * as ics from "ics";
import { ContentBaseController } from "./ContentBaseController.js";
import { Event, EventBooking } from "../models/index.js";
import { CalendarHelper, HolidayHelper, Permissions } from "../helpers/index.js";
import { ApprovalHelper } from "../helpers/ApprovalHelper.js";
import { ConflictHelper, ProposedBooking } from "../helpers/ConflictHelper.js";
import { IcsHelper } from "../helpers/IcsHelper.js";
import { WebhookDispatcher } from "../../../shared/webhooks/index.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { NotificationService } from "../../../shared/helpers/NotificationService.js";

@controller("/content/events")
export class EventController extends ContentBaseController {
  @httpGet("/timeline/group/:groupId")
  public async getPostsForGroup(@requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const eventIds = req.query.eventIds ? req.query.eventIds.toString().split(",") : [];
      return await this.repos.event.loadTimelineGroup(au.churchId, groupId, eventIds);
    });
  }

  @httpGet("/timeline")
  public async getPosts(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const eventIds = req.query.eventIds ? req.query.eventIds.toString().split(",") : [];
      return await this.repos.event.loadTimeline(au.churchId, au.groupIds, eventIds);
    });
  }

  @httpGet("/registerable")
  public async getRegisterable(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.event.loadRegistrationEnabled(au.churchId);
    });
  }

  // CA-1: the caller's own event/room requests joined with their bookings + statuses.
  @httpGet("/requests/mine")
  public async getMyRequests(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const events = await this.repos.event.loadRequestsForPerson(au.churchId, au.personId);
      const result = [];
      for (const event of events) {
        const bookings = await this.repos.eventBooking.loadForEvent(au.churchId, event.id);
        result.push({ ...event, bookings });
      }
      return result;
    });
  }

  @httpGet("/pending")
  public async getPendingApproval(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit) && !au.checkAccess(Permissions.calendars.admin)) return this.json({}, 401);
      return await this.repos.event.loadPendingApproval(au.churchId);
    });
  }

  @httpGet("/subscribe")
  public async subscribe(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let newEvents: any[] = [];
      if (req.query.groupId) {
        // authz-exempt: public ICS feed; churchId is the published feed identifier
        const groupEvents = await this.repos.event.loadPublicForGroup(req.query.churchId.toString(), req.query.groupId.toString());
        if (groupEvents && groupEvents.length > 0) {
          await CalendarHelper.addExceptionDates(groupEvents, this.repos);
          newEvents = this.populateEventsForICS(groupEvents);
        }
      } else if (req.query.roomId) {
        // authz-exempt: public ICS feed; churchId is the published feed identifier
        const roomEvents = await this.repos.event.loadForRoom(req.query.churchId.toString(), req.query.roomId.toString());
        if (roomEvents && roomEvents.length > 0) {
          await CalendarHelper.addExceptionDates(roomEvents, this.repos);
          newEvents = this.populateEventsForICS(roomEvents);
        }
      } else if (req.query.curatedCalendarId) {
        // authz-exempt: public ICS feed; churchId is the published feed identifier
        const curatedEvents = await this.repos.curatedEvent.loadForEvents(req.query.curatedCalendarId.toString(), req.query.churchId.toString());
        if (curatedEvents && curatedEvents.length > 0) {
          await CalendarHelper.addExceptionDates(curatedEvents, this.repos);
          newEvents = this.populateEventsForICS(curatedEvents);
        }
      }
      const { error, value } = ics.createEvents(newEvents);

      if (error) {
        res.status(500).send("Error generating calendar.");
        return;
      }

      res.set("Content-Type", "text/calendar");
      res.send(value);
    });
  }

  @httpGet("/group/:groupId")
  public async getForGroup(@requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = await this.repos.event.loadForGroup(au.churchId, groupId);
      await CalendarHelper.addExceptionDates(result, this.repos);
      return result;
    });
  }

  @httpGet("/public/tag/:churchId/:tag")
  public async getPublicByTag(@requestParam("churchId") churchId: string, @requestParam("tag") tag: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.event.loadByTag(churchId, tag);
    });
  }

  @httpGet("/public/registerable/:churchId")
  public async getPublicRegisterable(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.event.loadRegistrationEnabled(churchId);
    });
  }

  @httpGet("/public/:churchId/:id")
  public async getPublicById(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return await this.repos.event.load(churchId, id);
    });
  }

  @httpGet("/public/group/:churchId/:groupId")
  public async getPublicForGroup(@requestParam("churchId") churchId: string, @requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = await this.repos.event.loadPublicForGroup(churchId, groupId);
      await CalendarHelper.addExceptionDates(result, this.repos);
      return result;
    });
  }

  // Holidays in a date window, for the bulk-event "skip holidays" preview.
  @httpGet("/holidays")
  public async holidays(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const start = req.query.start ? new Date(req.query.start.toString()) : new Date();
      const end = req.query.end ? new Date(req.query.end.toString()) : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
      return HolidayHelper.getHolidays(start, end);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.event.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Event[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const hasStaffAccess = au.checkAccess(Permissions.content.edit) || au.checkAccess(Permissions.calendars.admin);
      if (!hasStaffAccess) {
        for (const event of req.body) {
          if (!event.groupId || !au.leaderGroupIds?.includes(event.groupId)) return this.json({}, 401);
          if (event.id) {
            const existing = await this.repos.event.load(au.churchId, event.id);
            if (!existing || !existing.groupId || !au.leaderGroupIds?.includes(existing.groupId)) return this.json({}, 401);
          }
        }
      }
      const promises: Promise<Event>[] = [];
      req.body.forEach((event) => {
        event.churchId = au.churchId;
        const isNew = !event.id;
        promises.push(
          this.repos.event.save(event).then(async (saved) => {
            await WebhookDispatcher.emit(au.churchId, isNew ? "event.created" : "event.updated", saved);
            return saved;
          })
        );
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  // Pre-save conflict check for a proposed event + room/resource bookings.
  // authz-exempt: self-service — read-only conflict check over data scoped to au.churchId
  @httpPost("/conflicts")
  public async conflicts(req: express.Request<{}, {}, ProposedBooking>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const proposed: ProposedBooking = {
        eventId: req.body.eventId,
        start: req.body.start,
        end: req.body.end,
        recurrenceRule: req.body.recurrenceRule,
        setupMinutes: req.body.setupMinutes,
        teardownMinutes: req.body.teardownMinutes,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        roomIds: req.body.roomIds || [],
        resources: req.body.resources || []
      };
      const windowStart = new Date();
      const windowEnd = new Date();
      windowEnd.setFullYear(windowEnd.getFullYear() + 1);
      const resourceIds = proposed.resources.map((r) => r.resourceId);
      return ConflictHelper.findConflicts(proposed, {
        windowStart,
        windowEnd,
        roomBookings: await this.repos.eventBooking.loadActiveForRooms(au.churchId, proposed.roomIds, proposed.eventId),
        resourceBookings: await this.repos.eventBooking.loadActiveForResources(au.churchId, resourceIds, proposed.eventId),
        rooms: await this.repos.room.loadByIds(au.churchId, proposed.roomIds),
        resources: await this.repos.resource.loadByIds(au.churchId, resourceIds),
        blockouts: await this.repos.calendarBlockout.loadOverlapping(au.churchId, windowStart, windowEnd)
      });
    });
  }

  // Non-staff event request: creates a private, pending event (plus bookings)
  // that surfaces in the approvals inbox.
  @httpPost("/request")
  public async request(req: express.Request<{}, {}, any>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const event: Event = {
        churchId: au.churchId,
        groupId: req.body.groupId,
        title: req.body.title,
        description: req.body.description,
        start: req.body.start ? new Date(req.body.start) : undefined,
        end: req.body.end ? new Date(req.body.end) : undefined,
        allDay: req.body.allDay,
        recurrenceRule: req.body.recurrenceRule,
        visibility: "private",
        approvalStatus: "pending",
        requestedBy: au.personId
      };
      const saved = await this.repos.event.save(event);
      const bookings = await this.saveBookingsForEvent(au, saved.id, req.body.roomIds || [], req.body.resources || []);
      return { event: saved, bookings };
    });
  }

  // Bulk-create events from an uploaded .ics file.
  @httpPost("/ical")
  public async importIcal(req: express.Request<{}, {}, { ics: string; groupId: string; visibility?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      if (!req.body.ics || !req.body.groupId) return this.json({ error: "ics and groupId are required" }, 400);
      const parsed = IcsHelper.parseEvents(req.body.ics).slice(0, 500);
      const result: Event[] = [];
      for (const ev of parsed) {
        const event: Event = {
          churchId: au.churchId,
          groupId: req.body.groupId,
          title: ev.title || "(untitled)",
          description: ev.description,
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay,
          recurrenceRule: ev.recurrenceRule,
          visibility: req.body.visibility || "public"
        };
        result.push(await this.repos.event.save(event));
      }
      return result;
    });
  }

  // authz-exempt: gated by resolveEvent(...) → content.edit/calendars.admin check
  @httpPost("/:id/approve")
  public async approve(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.resolveEvent(req, res, id, "approved");
  }

  // authz-exempt: gated by resolveEvent(...) → content.edit/calendars.admin check
  @httpPost("/:id/reject")
  public async reject(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.resolveEvent(req, res, id, "rejected");
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.event.load(au.churchId, id);
      // CA-1: a requester may withdraw their own still-pending request.
      const isSelfCancel = !!existing && existing.requestedBy === au.personId && existing.approvalStatus === "pending";
      if (!au.checkAccess(Permissions.content.edit) && !isSelfCancel) return this.json({}, 401);
      else {
        await this.repos.event.delete(au.churchId, id);
        await this.repos.eventBooking.deleteForEvent(au.churchId, id);
        await WebhookDispatcher.emit(au.churchId, "event.destroyed", { id, churchId: au.churchId });
        return this.json({});
      }
    });
  }

  private resolveEvent(req: express.Request, res: express.Response, id: string, status: "approved" | "rejected") {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit) && !au.checkAccess(Permissions.calendars.admin)) return this.json({}, 401);
      const event = await this.repos.event.load(au.churchId, id);
      if (!event) return this.json({}, 404);
      event.approvalStatus = status;
      if (status === "approved") event.visibility = "public";
      const result = await this.repos.event.save(event);
      if (event.requestedBy) {
        try {
          await NotificationService.createNotifications([event.requestedBy], au.churchId, "event", event.id, `Your event request "${event.title}" was ${status}.`);
        } catch (e) {
          console.error("[EventController] Failed to notify event requester:", e);
        }
      }
      return result;
    });
  }

  private async saveBookingsForEvent(au: any, eventId: string, roomIds: string[], resources: { resourceId: string; quantity: number }[]): Promise<EventBooking[]> {
    const members = au.personId ? await getMembershipModuleGateway().loadGroupMembersForPerson(au.churchId, au.personId) : [];
    const requesterGroupIds = members.map((m: any) => m.groupId);
    const result: EventBooking[] = [];
    for (const roomId of roomIds) {
      const room = await this.repos.room.load(au.churchId, roomId);
      if (!room) continue;
      result.push(await this.repos.eventBooking.save({
        churchId: au.churchId,
        eventId,
        roomId,
        quantity: 1,
        status: ApprovalHelper.determineStatus(room.approvalGroupId, requesterGroupIds),
        requestedBy: au.personId,
        requestedDate: new Date()
      }));
    }
    for (const r of resources) {
      const resource = await this.repos.resource.load(au.churchId, r.resourceId);
      if (!resource) continue;
      result.push(await this.repos.eventBooking.save({
        churchId: au.churchId,
        eventId,
        resourceId: r.resourceId,
        quantity: r.quantity || 1,
        status: ApprovalHelper.determineStatus(resource.approvalGroupId, requesterGroupIds),
        requestedBy: au.personId,
        requestedDate: new Date()
      }));
    }
    return result;
  }

  private populateEventsForICS(events: Event[]) {
    const result: any[] = [];
    events.forEach((ev: Event) => {
      const newEv: any = {};
      newEv.start = ev.start.getTime();
      newEv.end = ev.end.getTime();
      newEv.title = ev.title;
      newEv.description = ev.description || "";
      newEv.recurrenceRule = ev.recurrenceRule || "";
      newEv.exclusionDates = ev.exceptionDates || [];
      result.push(newEv);
    });
    return result;
  }
}
