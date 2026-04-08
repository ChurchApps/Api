import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { Service } from "../models/index.js";

@controller("/attendance/services")
export class ServiceController extends AttendanceBaseController {
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.service.searchByCampus(au.churchId, req.query.campusId.toString());
      return this.repos.service.convertAllToModel(au.churchId, data as any);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.service.load(au.churchId, id);
      return this.repos.service.convertToModel(au.churchId, data);
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

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Service[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      const promises: Promise<Service>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.service.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.service.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      await this.repos.service.delete(au.churchId, id);
      return {};
    });
  }
}
