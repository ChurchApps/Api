import { controller, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingCrudController } from "./DoingCrudController.js";

@controller("/doing/contentProviderAuths")
export class ContentProviderAuthController extends DoingCrudController {
  protected crudSettings = {
    repoKey: "contentProviderAuth",
    permissions: { view: null, edit: null },
    routes: ["getById", "getAll", "post", "delete"] as const
  };

  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repos.contentProviderAuth.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/ministry/:ministryId")
  public async getByMinistry(@requestParam("ministryId") ministryId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.contentProviderAuth.loadByMinistry(au.churchId, ministryId);
    });
  }

  @httpGet("/ministry/:ministryId/:providerId")
  public async getByMinistryAndProvider(
    @requestParam("ministryId") ministryId: string,
    @requestParam("providerId") providerId: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.contentProviderAuth.loadByMinistryAndProvider(au.churchId, ministryId, providerId);
    });
  }
}
