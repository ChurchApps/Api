import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Position } from "../models/index.js";

@controller("/doing/positions")
export class PositionController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = req.query.ids as string;
      const ids = idsString.split(",");
      return await this.repos.position.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/plan/ids")
  public async getByPlanIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const planIdsString = req.query.planIds as string;
      const planIds = planIdsString.split(",");
      return await this.repos.position.loadByPlanIds(au.churchId, planIds);
    });
  }

  @httpGet("/plan/:planId")
  public async getForPlan(@requestParam("planId") planId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.position.loadByPlanId(au.churchId, planId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.position.load(au.churchId, id);
      return this.repos.position.convertToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Position[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Position>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.position.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.position.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.position.delete(au.churchId, id);
      return {};
    });
  }
}
