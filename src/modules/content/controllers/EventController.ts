import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import * as ics from "ics";
import { ContentBaseController } from "./ContentBaseController";
import { Event, EventException } from "../models";
import { Permissions } from "../helpers";

@controller("/content/events")
export class EventController extends ContentBaseController {
  @httpGet("/timeline/group/:groupId")
  public async getPostsForGroup(@requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const eventIds = req.query.eventIds ? req.query.eventIds.toString().split(",") : [];
      return await this.repositories.event.loadTimelineGroup(au.churchId, groupId, eventIds);
    });
  }

  @httpGet("/timeline")
  public async getPosts(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const eventIds = req.query.eventIds ? req.query.eventIds.toString().split(",") : [];
      return await this.repositories.event.loadTimeline(au.churchId, au.groupIds, eventIds);
    });
  }

  @httpGet("/subscribe")
  public async subscribe(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let newEvents: any[] = [];
      if (req.query.groupId) {
        const groupEvents = await this.repositories.event.loadForGroup(req.query.churchId.toString(), req.query.groupId.toString());
        if (groupEvents && groupEvents.length > 0) newEvents = this.populateEventsForICS(groupEvents);
      } else if (req.query.curatedCalendarId) {
        const curatedEvents = await this.repositories.curatedEvent.loadForEvents(req.query.curatedCalendarId.toString(), req.query.churchId.toString());
        if (curatedEvents && curatedEvents.length > 0) newEvents = this.populateEventsForICS(curatedEvents);
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
      const result = await this.repositories.event.loadForGroup(au.churchId, groupId);
      await this.addExceptionDates(result);
      return result;
    });
  }

  @httpGet("/public/group/:churchId/:groupId")
  public async getPublicForGroup(@requestParam("churchId") churchId: string, @requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = await this.repositories.event.loadPublicForGroup(churchId, groupId);
      await this.addExceptionDates(result);
      return result;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.event.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Event[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      // else {
      const promises: Promise<Event>[] = [];
      req.body.forEach((event) => {
        event.churchId = au.churchId;
        promises.push(this.repositories.event.save(event));
      });
      const result = await Promise.all(promises);
      return result;
      // }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repositories.event.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  private async addExceptionDates(events: Event[]) {
    if (events.length === 0) return;
    const eventIds = events.map((event) => event.id);
    events.forEach((event) => {
      event.exceptionDates = [];
    });
    const result = await this.repositories.eventException.loadForEvents(events[0].churchId, eventIds);
    result.forEach((eventException: EventException) => {
      const event = events.find((ev) => ev.id === eventException.eventId);
      if (event) event.exceptionDates.push(eventException.exceptionDate);
    });
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
