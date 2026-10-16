import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { ScheduleEntry } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/scheduleEntries")
export class ScheduleEntryController extends DoingBaseController {
  @httpGet("/group/:screenGroupId")
  public async getByScreenGroup(@requestParam("screenGroupId") screenGroupId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.scheduleEntry.loadByScreenGroupId(au.churchId, screenGroupId);
      return this.repos.scheduleEntry.convertAllToModel(au.churchId, data);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.scheduleEntry.load(au.churchId, id);
      return this.repos.scheduleEntry.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.scheduleEntry.loadAll(au.churchId);
      return this.repos.scheduleEntry.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, ScheduleEntry[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const promises: Promise<ScheduleEntry>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.scheduleEntry.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.scheduleEntry.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      await this.repos.scheduleEntry.delete(au.churchId, id);
      return {};
    });
  }
}
