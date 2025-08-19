import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { Position } from "../models";

@controller("/doing/positions")
export class PositionController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = req.query.ids as string;
      const ids = idsString.split(",");
      return await this.repositories.position.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.position.load(au.churchId, id);
    });
  }

  @httpGet("/plan/ids")
  public async getByPlanIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const planIdsString = req.query.planIds as string;
      const planIds = planIdsString.split(",");
      return await this.repositories.position.loadByPlanIds(au.churchId, planIds);
    });
  }

  @httpGet("/plan/:planId")
  public async getForPlan(
    @requestParam("planId") planId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.position.loadByPlanId(au.churchId, planId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Position[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Position>[] = [];
      req.body.forEach((position) => {
        position.churchId = au.churchId;
        promises.push(this.repositories.position.save(position));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.position.delete(au.churchId, id);
      return {};
    });
  }
}