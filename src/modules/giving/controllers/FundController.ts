import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { GivingCrudController } from "./GivingCrudController";
import { Permissions } from "../../../shared/helpers/Permissions";
import { CrudHelper } from "../../../shared/controllers";

@controller("/giving/funds")
export class FundController extends GivingCrudController {
  // Inherited endpoints from GenericCrudController:
  // - GET "/:id" (view)
  // - GET "/" (list)
  // - POST "/" (save many)
  // - DELETE "/:id" (remove)

  protected crudSettings = {
    repoKey: "fund",
    permissions: { view: null, edit: Permissions.donations.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };

  @httpGet("/churchId/:churchId")
  public async getForChurch(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return CrudHelper.listAnonWrapped(this, req, res, "fund", (repos) => repos.fund.loadAll(churchId));
  }
}
