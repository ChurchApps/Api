import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { AttendanceCrudController } from "./AttendanceCrudController";
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
      const data = await this.repos.service.searchByCampus(au.churchId, req.query.campusId.toString());
      return this.repos.service.convertAllToModel(au.churchId, data as any);
    });
  }

  // Override getAll to use loadWithCampus
  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.service.loadWithCampus(au.churchId);
      return this.repos.service.convertAllToModel(au.churchId, data as any);
    });
  }
}
