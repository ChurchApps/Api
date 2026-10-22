import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { EventException } from "../models/index.js";
import { Permissions } from "../helpers/index.js";

@controller("/content/eventExceptions")
export class EventExceptionController extends ContentBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.eventException.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, EventException[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!(await this.canEdit(au, req.body))) return this.json({}, 401);
      else {
        const promises: Promise<EventException>[] = [];
        req.body.forEach((eventException) => {
          eventException.churchId = au.churchId;
          promises.push(this.repos.eventException.save(eventException));
        });
        const result = await Promise.all(promises);
        return result;
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const existing = await this.repos.eventException.load(au.churchId, id);
      if (!(await this.canEdit(au, existing ? [existing] : []))) return this.json({}, 401);
      else {
        await this.repos.eventException.delete(au.churchId, id);
        return this.json({});
      }
    });
  }

  // Same people who can save the parent event: staff, or a leader of the event's group.
  private async canEdit(au: any, exceptions: EventException[]): Promise<boolean> {
    if (au.checkAccess(Permissions.content.edit) || au.checkAccess(Permissions.calendars.admin)) return true;
    if (exceptions.length === 0) return false;
    for (const exception of exceptions) {
      if (exception.id) {
        const existing = await this.repos.eventException.load(au.churchId, exception.id);
        if (!existing || !(await this.leadsEventGroup(au, existing.eventId))) return false;
      }
      if (!(await this.leadsEventGroup(au, exception.eventId))) return false;
    }
    return true;
  }

  private async leadsEventGroup(au: any, eventId?: string): Promise<boolean> {
    if (!eventId) return false;
    const event = await this.repos.event.load(au.churchId, eventId);
    return !!event?.groupId && !!au.leaderGroupIds?.includes(event.groupId);
  }
}
