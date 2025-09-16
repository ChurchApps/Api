import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingCrudController } from "./DoingCrudController";

@controller("/doing/positions")
export class PositionController extends DoingCrudController {
  protected crudSettings = { repoKey: "position", permissions: {}, routes: ["getById", "post", "delete"] as const };
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

  // Inherit GET /:id, POST /, and DELETE /:id
}
