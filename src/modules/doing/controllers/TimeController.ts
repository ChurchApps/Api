import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { Time } from "../models";

@controller("/doing/times")
export class TimeController extends DoingBaseController {
  @httpGet("/plans")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = req.query.planIds as string;
      const planIds = idsString.split(",");
      return await this.repositories.time.loadByPlanIds(au.churchId, planIds);
    });
  }

  @httpGet("/all")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.time.loadAll(au.churchId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.time.load(au.churchId, id);
    });
  }

  @httpGet("/plan/:planId")
  public async getForPlan(@requestParam("planId") planId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.time.loadByPlanId(au.churchId, planId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Time[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<Time>[] = [];
      req.body.forEach((time) => {
        time.churchId = au.churchId;
        promises.push(this.repositories.time.save(time));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repositories.time.delete(au.churchId, id);
      return {};
    });
  }
}
