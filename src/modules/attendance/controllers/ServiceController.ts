import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceCrudController } from "./AttendanceCrudController";
import { Service } from "../models";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/services")
export class ServiceController extends AttendanceCrudController {
  protected crudSettings = {
    repoKey: "service",
    permissions: { view: undefined, edit: Permissions.services.edit },
    routes: ["getById", "getAll", "post", "delete"] as const
  };
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.service.searchByCampus(au.churchId, req.query.campusId.toString());
      return this.repositories.service.convertAllToModel(au.churchId, data as any);
    });
  }

  // Override getAll to use loadWithCampus
  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.service.loadWithCampus(au.churchId);
      return this.repositories.service.convertAllToModel(au.churchId, data as any);
    });
  }

  // Inherit POST / and DELETE /:id

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      else {
        await this.repositories.service.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
