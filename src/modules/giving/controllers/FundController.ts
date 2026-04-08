import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingBaseController } from "./GivingBaseController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";
import { Fund } from "../models/index.js";

@controller("/giving/funds")
export class FundController extends GivingBaseController {

  @httpGet("/churchId/:churchId")
  public async getForChurch(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const data = await this.repos.fund.loadAll(churchId);
      return this.repos.fund.convertAllToModel(churchId, data);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.fund.load(au.churchId, id);
      return this.repos.fund.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.fund.loadAll(au.churchId);
      return this.repos.fund.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Fund[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      const promises: Promise<Fund>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.fund.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.fund.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.edit)) return this.json({}, 401);
      await this.repos.fund.delete(au.churchId, id);
      return {};
    });
  }
}
