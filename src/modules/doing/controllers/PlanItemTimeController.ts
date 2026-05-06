import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { PlanItemTime } from "../models/index.js";
import { PlanAuth } from "../../../shared/helpers/index.js";

@controller("/doing/planItemTimes")
export class PlanItemTimeController extends DoingBaseController {
  @httpGet("/plan/:planId")
  public async getForPlan(@requestParam("planId") planId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.planItemTime.loadByPlanId(au.churchId, planId);
    });
  }

  @httpGet("/planItem/:planItemId")
  public async getForPlanItem(@requestParam("planItemId") planItemId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.planItemTime.loadByPlanItemId(au.churchId, planItemId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PlanItemTime[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      for (const pit of req.body) {
        const planItem: any = await this.repos.planItem.load(au.churchId, pit.planItemId || "");
        if (!planItem || !await PlanAuth.canEditPlan(au, planItem.planId)) return this.json({}, 401);
      }
      const promises: Promise<PlanItemTime>[] = [];
      req.body.forEach((pit) => {
        pit.churchId = au.churchId;
        promises.push(this.repos.planItemTime.save(pit));
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const pit: any = await this.repos.planItemTime.load(au.churchId, id);
      if (pit) {
        const planItem: any = await this.repos.planItem.load(au.churchId, pit.planItemId);
        if (!planItem || !await PlanAuth.canEditPlan(au, planItem.planId)) return this.json({}, 401);
        await this.repos.planItemTime.delete(au.churchId, id);
      }
      return {};
    });
  }
}
