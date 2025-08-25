import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { Service } from "../models";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/services")
export class ServiceController extends AttendanceBaseController {
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.service.searchByCampus(au.churchId, req.query.campusId.toString());
      const dataArray = (data as any)?.rows || data || [];
      return this.repositories.service.convertAllToModel(au.churchId, dataArray);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      return this.repositories.service.convertToModel(au.churchId, await this.repositories.service.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.service.loadWithCampus(au.churchId);
      const dataArray = (data as any)?.rows || data || [];
      return this.repositories.service.convertAllToModel(au.churchId, dataArray);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Service[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Service>[] = [];
        req.body.forEach((service) => {
          service.churchId = au.churchId;
          promises.push(this.repositories.service.save(service));
        });
        const result = await Promise.all(promises);
        return this.repositories.service.convertAllToModel(au.churchId, result);
      }
    });
  }

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
