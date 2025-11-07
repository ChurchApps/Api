import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import * as ics from "ics";
import { ContentBaseController } from "./ContentBaseController";
import { Event, EventException } from "../models";
import { CalendarHelper, Permissions } from "../helpers";

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

  @httpGet("/subscribe")
  public async subscribe(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      let newEvents: any[] = [];
      if (req.query.groupId) {
        const groupEvents = await this.repos.event.loadForGroup(req.query.churchId.toString(), req.query.groupId.toString());
        if (groupEvents && groupEvents.length > 0) {
          await CalendarHelper.addExceptionDates(groupEvents, this.repos);
          newEvents = this.populateEventsForICS(groupEvents);
        }
      } else if (req.query.curatedCalendarId) {
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

  @httpGet("/public/group/:churchId/:groupId")
  public async getPublicForGroup(@requestParam("churchId") churchId: string, @requestParam("groupId") groupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = await this.repos.event.loadPublicForGroup(churchId, groupId);
      await CalendarHelper.addExceptionDates(result, this.repos);
      return result;
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
      // if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      // else {
      const promises: Promise<Event>[] = [];
      req.body.forEach((event) => {
        event.churchId = au.churchId;
        promises.push(this.repos.event.save(event));
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
        await this.repos.event.delete(au.churchId, id);
        return this.json({});
      }
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
