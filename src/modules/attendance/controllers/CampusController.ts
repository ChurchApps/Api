import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { Campus } from "../models/index.js";

@controller("/attendance/campuses")
export class CampusController extends AttendanceBaseController {

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.campus.load(au.churchId, id);
      return this.repos.campus.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.campus.loadAll(au.churchId);
      return this.repos.campus.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Campus[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      const promises: Promise<Campus>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.campus.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.campus.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      await this.repos.campus.delete(au.churchId, id);
      return {};
    });
  }
}
