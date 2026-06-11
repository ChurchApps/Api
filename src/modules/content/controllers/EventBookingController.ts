import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { EventBooking } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { ApprovalHelper } from "../helpers/ApprovalHelper.js";
import { ConflictHelper } from "../helpers/ConflictHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { NotificationService } from "../../../shared/helpers/NotificationService.js";

@controller("/content/eventBookings")
export class EventBookingController extends ContentBaseController {
  @httpGet("/event/:eventId")
  public async getForEvent(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.eventBooking.loadForEvent(au.churchId, eventId);
    });
  }

  // Approvals inbox. Conflict resolvers (or content editors) see everything;
  // approval-group members see the requests routed to their groups.
  @httpGet("/pending")
  public async getPending(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let pending = await this.repos.eventBooking.loadPending(au.churchId);
      if (!this.canResolve(au)) {
        const groupIds = await this.loadRequesterGroupIds(au.churchId, au.personId);
        pending = pending.filter((row: any) => groupIds.includes(row.roomId ? row.roomApprovalGroupId : row.resourceApprovalGroupId));
      }
      for (const row of pending) row.conflicts = await this.computeConflicts(au.churchId, row);
      return pending;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, EventBooking[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const requesterGroupIds = await this.loadRequesterGroupIds(au.churchId, au.personId);
      const result: EventBooking[] = [];
      for (const booking of req.body) {
        booking.churchId = au.churchId;
        if (!booking.id) {
          booking.requestedBy = au.personId;
          booking.requestedDate = new Date();
          booking.quantity = booking.quantity || 1;
          const approvalGroupId = await this.getApprovalGroupId(au.churchId, booking);
          booking.status = ApprovalHelper.determineStatus(approvalGroupId, requesterGroupIds);
        }
        result.push(await this.repos.eventBooking.save(booking));
      }
      return result;
    });
  }

  @httpPost("/:id/approve")
  public async approve(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.resolveBooking(req, res, id, "approved");
  }

  @httpPost("/:id/reject")
  public async reject(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.resolveBooking(req, res, id, "rejected");
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const booking = await this.repos.eventBooking.load(au.churchId, id);
      if (!booking) return this.json({}, 404);
      if (!au.checkAccess(Permissions.content.edit) && booking.requestedBy !== au.personId) return this.json({}, 401);
      await this.repos.eventBooking.delete(au.churchId, id);
      return this.json({});
    });
  }

  private resolveBooking(req: express.Request, res: express.Response, id: string, status: "approved" | "rejected") {
    return this.actionWrapper(req, res, async (au) => {
      const booking = await this.repos.eventBooking.load(au.churchId, id);
      if (!booking) return this.json({}, 404);
      if (!this.canResolve(au)) {
        const approvalGroupId = await this.getApprovalGroupId(au.churchId, booking);
        const groupIds = await this.loadRequesterGroupIds(au.churchId, au.personId);
        if (!approvalGroupId || !groupIds.includes(approvalGroupId)) return this.json({}, 401);
      }
      booking.status = status;
      booking.resolvedBy = au.personId;
      booking.resolvedDate = new Date();
      const result = await this.repos.eventBooking.save(booking);
      await this.notifyRequester(au.churchId, booking, status);
      return result;
    });
  }

  private canResolve(au: any): boolean {
    return au.checkAccess(Permissions.content.edit) || au.checkAccess(Permissions.calendars.admin);
  }

  private async loadRequesterGroupIds(churchId: string, personId: string): Promise<string[]> {
    if (!personId) return [];
    const members = await getMembershipModuleGateway().loadGroupMembersForPerson(churchId, personId);
    return members.map((m) => m.groupId);
  }

  private async getApprovalGroupId(churchId: string, booking: EventBooking): Promise<string | undefined> {
    if (booking.roomId) return (await this.repos.room.load(churchId, booking.roomId))?.approvalGroupId;
    if (booking.resourceId) return (await this.repos.resource.load(churchId, booking.resourceId))?.approvalGroupId;
    return undefined;
  }

  private async notifyRequester(churchId: string, booking: EventBooking, status: string) {
    if (!booking.requestedBy) return;
    try {
      const target = booking.roomId ? (await this.repos.room.load(churchId, booking.roomId))?.name : (await this.repos.resource.load(churchId, booking.resourceId))?.name;
      const event = await this.repos.event.load(churchId, booking.eventId);
      const message = `Your request for ${target || "a room/resource"} for "${event?.title || "an event"}" was ${status}.`;
      await NotificationService.createNotifications([booking.requestedBy], churchId, "eventBooking", booking.id, message);
    } catch (e) {
      console.error("[EventBookingController] Failed to notify requester:", e);
    }
  }

  // Conflicts surfaced on each pending row so the inbox can flag double-bookings before approval.
  private async computeConflicts(churchId: string, row: any) {
    const windowStart = new Date();
    const windowEnd = new Date();
    windowEnd.setFullYear(windowEnd.getFullYear() + 1);
    const roomIds = row.roomId ? [row.roomId] : [];
    const resources = row.resourceId ? [{ resourceId: row.resourceId, quantity: row.quantity || 1 }] : [];
    return ConflictHelper.findConflicts(
      { eventId: row.eventId, start: row.eventStart, end: row.eventEnd, recurrenceRule: row.eventRecurrenceRule, roomIds, resources },
      {
        windowStart,
        windowEnd,
        roomBookings: await this.repos.eventBooking.loadActiveForRooms(churchId, roomIds, row.eventId),
        resourceBookings: await this.repos.eventBooking.loadActiveForResources(churchId, resources.map((r) => r.resourceId), row.eventId),
        rooms: row.roomId ? await this.repos.room.loadByIds(churchId, roomIds) : [],
        resources: row.resourceId ? await this.repos.resource.loadByIds(churchId, [row.resourceId]) : [],
        blockouts: await this.repos.calendarBlockout.loadOverlapping(churchId, windowStart, windowEnd)
      }
    );
  }
}
