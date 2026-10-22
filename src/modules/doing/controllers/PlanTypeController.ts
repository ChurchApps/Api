import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { PlanType } from "../models/index.js";
import { PlanAuth } from "../../../shared/helpers/index.js";
import { InternalEventBus } from "../../../shared/events/InternalEventBus.js";

@controller("/doing/planTypes")
export class PlanTypeController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repos.planType.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/ministryId/:ministryId")
  public async getByMinistryId(@requestParam("ministryId") ministryId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.planType.loadByMinistryId(au.churchId, ministryId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.planType.load(au.churchId, id);
      return this.repos.planType.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.planType.loadAll(au.churchId);
      return this.repos.planType.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PlanType[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      for (const item of req.body) {
        let ministryId = item.ministryId;
        if (!ministryId && item.id) {
          const existing: any = await this.repos.planType.load(au.churchId, item.id);
          ministryId = existing?.ministryId;
        }
        if (!await PlanAuth.canEditMinistry(au, ministryId)) return this.json({}, 401);
      }
      const promises: Promise<PlanType>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.planType.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.planType.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!await PlanAuth.canEditPlanType(au, id)) return this.json({}, 401);
      // Plans have no FK to planTypes, so deleting only the type leaves its plans (and their signups) orphaned.
      const plans = await this.repos.plan.loadByPlanTypeId(au.churchId, id);
      for (const plan of plans) {
        await this.repos.planItemTime.deleteByPlanId(au.churchId, plan.id);
        await this.repos.time.deleteByPlanId(au.churchId, plan.id);
        await this.repos.assignment.deleteByPlanId(au.churchId, plan.id);
        await this.repos.position.deleteByPlanId(au.churchId, plan.id);
        await this.repos.planItem.deleteByPlanId(au.churchId, plan.id);
        await this.repos.plan.delete(au.churchId, plan.id);
        await InternalEventBus.publish(au.churchId, "plan.destroyed", { id: plan.id });
      }
      await this.repos.planType.delete(au.churchId, id);
      return {};
    });
  }
}
