import { controller, httpPost, httpGet, interfaces, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { EventLog } from "../models";

@controller("/giving/eventLog")
export class EventLogController extends GivingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      else return this.repositories.eventLog.convertToModel(await this.repositories.eventLog.load(au.churchId, id));
    });
  }

  @httpGet("/type/:type")
  public async getByType(@requestParam("type") type: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      return this.repositories.eventLog.convertAllToModel((await this.repositories.eventLog.loadByType(au.churchId, type)) as any[]);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      else return this.repositories.eventLog.convertAllToModel((await this.repositories.eventLog.loadAll(au.churchId)) as any[]);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, EventLog[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json([], 401);
      else {
        const promises: Promise<EventLog>[] = [];
        req.body.forEach((eventLog) => {
          eventLog.churchId = au.churchId;
          promises.push(this.repositories.eventLog.save(eventLog));
        });
        const result = await Promise.all(promises);
        return this.repositories.eventLog.convertAllToModel(result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json([], 401);
      else {
        await this.repositories.eventLog.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
