import { controller, httpPost, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { EventRsvp } from "../models/index.js";
import { Permissions } from "../helpers/index.js";

@controller("/content/events")
export class EventRsvpController extends ContentBaseController {
  // Batch counts + the caller's own response for every occurrence in a window.
  // Group member only. Registered before /:eventId/rsvps so the literal path wins.
  @httpGet("/rsvps/group/:groupId")
  public async getGroupBatch(@requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.groupIds?.includes(groupId)) return this.json({}, 401);
      const from = req.query.from ? new Date(req.query.from.toString()) : new Date();
      const to = req.query.to ? new Date(req.query.to.toString()) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const rows = await this.repos.eventRsvp.loadForGroupWindow(au.churchId, groupId, from, to);
      const map = new Map<string, { eventId: string; occurrenceStart: any; yes: number; no: number; maybe: number; mine: string | null }>();
      for (const r of rows as any[]) {
        const key = `${r.eventId}|${new Date(r.occurrenceStart).getTime()}`;
        let entry = map.get(key);
        if (!entry) {
          entry = { eventId: r.eventId, occurrenceStart: r.occurrenceStart, yes: 0, no: 0, maybe: 0, mine: null };
          map.set(key, entry);
        }
        if (r.response === "yes") entry.yes++;
        else if (r.response === "no") entry.no++;
        else if (r.response === "maybe") entry.maybe++;
        if (r.personId === au.personId) entry.mine = r.response;
      }
      return Array.from(map.values());
    });
  }

  // Full roster for one occurrence, grouped-by-response on the client. Leader or staff.
  @httpGet("/:eventId/rsvps")
  public async getRoster(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const event = await this.repos.event.load(au.churchId, eventId);
      if (!event) return this.json({}, 404);
      const isLeader = !!event.groupId && au.leaderGroupIds?.includes(event.groupId);
      if (!isLeader && !au.checkAccess(Permissions.groups.edit)) return this.json({}, 401);
      if (!req.query.occurrenceStart) return this.json({ error: "occurrenceStart is required" }, 400);
      return this.repos.eventRsvp.loadForOccurrence(au.churchId, eventId, new Date(req.query.occurrenceStart.toString()));
    });
  }

  @httpPost("/:eventId/rsvp")
  public async setRsvp(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, { occurrenceStart: string; response: "yes" | "no" | "maybe" }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const event = await this.repos.event.load(au.churchId, eventId);
      if (!event) return this.json({}, 404);
      if (!event.groupId || !au.groupIds?.includes(event.groupId)) return this.json({}, 401);
      if (event.rsvpDisabled) return this.json({ error: "RSVP is disabled for this event" }, 400);
      if (!req.body.occurrenceStart || !["yes", "no", "maybe"].includes(req.body.response)) return this.json({ error: "occurrenceStart and a valid response are required" }, 400);
      const model: EventRsvp = {
        churchId: au.churchId,
        eventId,
        personId: au.personId,
        occurrenceStart: new Date(req.body.occurrenceStart),
        response: req.body.response
      };
      return this.repos.eventRsvp.save(model);
    });
  }

  // authz-exempt: gated on group membership (au.groupIds) below; deletes only the caller's own row (au.personId)
  @httpDelete("/:eventId/rsvp")
  public async clearRsvp(@requestParam("eventId") eventId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const event = await this.repos.event.load(au.churchId, eventId);
      if (!event) return this.json({}, 404);
      if (!event.groupId || !au.groupIds?.includes(event.groupId)) return this.json({}, 401);
      if (!req.query.occurrenceStart) return this.json({ error: "occurrenceStart is required" }, 400);
      await this.repos.eventRsvp.deleteOwn(au.churchId, eventId, au.personId, new Date(req.query.occurrenceStart.toString()));
      return this.json({});
    });
  }
}
