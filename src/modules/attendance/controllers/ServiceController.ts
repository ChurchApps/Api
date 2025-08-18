import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { Service } from "../models";
import { Permissions } from "../../../shared/helpers";

@controller("/services")
export class ServiceController extends AttendanceBaseController {
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getAttendanceRepositories();
      const data = await repos.service.searchByCampus(au.churchId, req.query.campusId.toString());
      const dataArray = (data as any)?.rows || data || [];
      return repos.service.convertAllToModel(au.churchId, dataArray);
    });
  }

  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getAttendanceRepositories();
      return repos.service.convertToModel(au.churchId, await repos.service.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getAttendanceRepositories();
      const data = await repos.service.loadWithCampus(au.churchId);
      const dataArray = (data as any)?.rows || data || [];
      return repos.service.convertAllToModel(au.churchId, dataArray);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Service[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const promises: Promise<Service>[] = [];
        req.body.forEach((service) => {
          service.churchId = au.churchId;
          promises.push(repos.service.save(service));
        });
        const result = await Promise.all(promises);
        return repos.service.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        await repos.service.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
