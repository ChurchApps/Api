import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { ServiceTime, GroupServiceTime } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/attendance/servicetimes")
export class ServiceTimeController extends AttendanceBaseController {
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const campusId = req.query.campusId.toString();
      const serviceId = req.query.serviceId.toString();
      const data = await this.repos.serviceTime.loadByChurchCampusService(au.churchId, campusId, serviceId);
      return this.repos.serviceTime.convertAllToModel(au.churchId, data as any);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.serviceTime.load(au.churchId, id);
      return this.repos.serviceTime.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      // return await this.repos.serviceTime.loadAll(au.churchId);
      let data = null;
      if (req.query.serviceId !== undefined) data = await this.repos.serviceTime.loadNamesByServiceId(au.churchId, req.query.serviceId.toString());
      else data = await this.repos.serviceTime.loadNamesWithCampusService(au.churchId);
      const result: ServiceTime[] = this.repos.serviceTime.convertAllToModel(au.churchId, data as any);
      if (result.length > 0 && this.include(req, "groups")) await this.appendGroups(au.churchId, result);
      return result;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, ServiceTime[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      const promises: Promise<ServiceTime>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.serviceTime.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.serviceTime.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      await this.repos.serviceTime.delete(au.churchId, id);
      return {};
    });
  }

  private async appendGroups(churchId: string, times: ServiceTime[]) {
    const timeIds: string[] = [];
    times.forEach((t) => {
      timeIds.push(t.id);
    });
    const allGroupServiceTimes: GroupServiceTime[] = (await this.repos.groupServiceTime.loadByServiceTimeIds(churchId, timeIds)) as any;
    const allGroupIds: string[] = [];
    if (allGroupServiceTimes) {
      allGroupServiceTimes.forEach((gst) => {
        if (allGroupIds.indexOf(gst.groupId) === -1) allGroupIds.push(gst.groupId);
      });
    }
  }
}
