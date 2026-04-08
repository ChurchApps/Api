import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { EventLog } from "../models/index.js";

@controller("/giving/eventLog")
export class EventLogController extends GivingBaseController {

  @httpGet("/type/:type")
  public async getByType(@requestParam("type") type: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      return this.repos.eventLog.convertAllToModel(au.churchId, (await this.repos.eventLog.loadByType(au.churchId, type)) as any[]);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json({}, 401);
      const data = await this.repos.eventLog.load(au.churchId, id);
      return this.repos.eventLog.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      const data = await this.repos.eventLog.loadAll(au.churchId);
      return this.repos.eventLog.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, EventLog[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      const promises: Promise<EventLog>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.eventLog.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.eventLog.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      await this.repos.eventLog.delete(au.churchId, id);
      return {};
    });
  }
}
