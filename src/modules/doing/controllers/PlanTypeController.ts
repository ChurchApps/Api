import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingCrudController } from "./DoingCrudController";

@controller("/doing/planTypes")
export class PlanTypeController extends DoingCrudController {
  protected crudSettings = {
    repoKey: "planType",
    permissions: { view: null, edit: null },
    routes: ["getById", "getAll", "post", "delete"] as const
  };
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repositories.planType.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/ministryId/:ministryId")
  public async getByMinistryId(@requestParam("ministryId") ministryId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.planType.loadByMinistryId(au.churchId, ministryId);
    });
  }
}
