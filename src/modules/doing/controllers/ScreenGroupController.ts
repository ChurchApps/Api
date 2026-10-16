import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { ScreenGroup } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/screenGroups")
export class ScreenGroupController extends DoingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.screenGroup.load(au.churchId, id);
      return this.repos.screenGroup.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.screenGroup.loadAll(au.churchId);
      return this.repos.screenGroup.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, ScreenGroup[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const promises: Promise<ScreenGroup>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.screenGroup.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.screenGroup.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      await this.repos.scheduleEntry.deleteByScreenGroupId(au.churchId, id);
      await this.repos.screenGroup.delete(au.churchId, id);
      return {};
    });
  }
}
