import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { PlanType } from "../models";

@controller("/doing/planTypes")
export class PlanTypeController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repositories.planType.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.planType.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getForAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.planType.loadAll(au.churchId);
    });
  }

  @httpGet("/ministryId/:ministryId")
  public async getByMinistryId(
    @requestParam("ministryId") ministryId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.planType.loadByMinistryId(au.churchId, ministryId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PlanType[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!req.body || !Array.isArray(req.body)) {
        return this.json({ error: "Request body must be an array of PlanType objects" });
      }
      
      const promises: Promise<PlanType>[] = [];
      req.body.forEach((planType) => {
        planType.churchId = au.churchId;
        promises.push(this.repositories.planType.save(planType));
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
      await this.repositories.planType.delete(au.churchId, id);
      return {};
    });
  }
}