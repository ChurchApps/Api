import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController.js";
import { Permissions } from "../../../shared/helpers/Permissions.js";

@controller("/giving/eventLog")
export class EventLogController extends GivingCrudController {
  // Inherited CRUD endpoints: GET /:id, GET /, POST /, DELETE /:id
  protected crudSettings = {
    repoKey: "eventLog",
    permissions: { view: Permissions.donations.viewSummary, edit: Permissions.donations.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };

  @httpGet("/type/:type")
  public async getByType(@requestParam("type") type: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.donations.viewSummary)) return this.json([], 401);
      return this.repos.eventLog.convertAllToModel(au.churchId, (await this.repos.eventLog.loadByType(au.churchId, type)) as any[]);
    });
  }

  // Additional endpoint beyond base CRUD
}
