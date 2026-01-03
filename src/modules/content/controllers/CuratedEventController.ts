import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { CuratedEvent } from "../models/index.js";
import { CalendarHelper, Permissions } from "../helpers/index.js";

@controller("/content/curatedEvents")
export class CuratedEventController extends ContentBaseController {
  @httpGet("/calendar/:curatedCalendarId")
  public async getForCuratedCalendar(@requestParam("curatedCalendarId") curatedCalendarId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (req.query?.withoutEvents) {
        return await this.repos.curatedEvent.loadByCuratedCalendarId(au.churchId, curatedCalendarId);
      }
      const result = await this.repos.curatedEvent.loadForEvents(curatedCalendarId, au.churchId);
      await CalendarHelper.addExceptionDates(result, this.repos);
      return result;
    });
  }

  @httpGet("/public/calendar/:churchId/:curatedCalendarId")
  public async getPublicForCuratedCalendar(
    @requestParam("churchId") churchId: string,
    @requestParam("curatedCalendarId") curatedCalendarId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = await this.repos.curatedEvent.loadForEvents(curatedCalendarId, churchId);
      await CalendarHelper.addExceptionDates(result, this.repos);
      return result;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.curatedEvent.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.curatedEvent.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PostRequestBody[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const promises: Promise<CuratedEvent | CuratedEvent[]>[] = [];
        req.body.forEach((curatedEvent) => {
          curatedEvent.churchId = au.churchId;
          const saveFunction = async () => {
            if (curatedEvent?.eventIds) {
              // If eventIds are there, it means only specific group events are need to be added.
              const eventPromises: Promise<CuratedEvent>[] = [];
              curatedEvent.eventIds.forEach((id) => {
                eventPromises.push(this.repos.curatedEvent.save({ ...curatedEvent, eventId: id }));
              });

              return await Promise.all(eventPromises);
            } else {
              // If eventId is not there, it means the whole group needs to be added to the curated calendar. All the group events will be added to the curated calendar.
              return await this.repos.curatedEvent.save(curatedEvent);
            }
          };

          promises.push(saveFunction());
        });

        const result = await Promise.all(promises);
        return result.flat();
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.curatedEvent.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  @httpDelete("/calendar/:curatedCalendarId/event/:eventId")
  public async deleteByEventId(
    @requestParam("curatedCalendarId") curatedCalendarId: string,
    @requestParam("eventId") eventId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.curatedEvent.deleteByEventId(au.churchId, curatedCalendarId, eventId);
        return this.json({});
      }
    });
  }

  @httpDelete("/calendar/:curatedCalendarId/group/:groupId")
  public async deleteByGroupId(
    @requestParam("curatedCalendarId") curatedCalendarId: string,
    @requestParam("groupId") groupId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.curatedEvent.deleteByGroupId(au.churchId, curatedCalendarId, groupId);
        return this.json({});
      }
    });
  }
}

interface PostRequestBody extends CuratedEvent {
  eventIds?: string[];
}
