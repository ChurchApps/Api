import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { Headcount } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/attendance/headcounts")
export class HeadcountController extends AttendanceBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      const data = await this.repos.headcount.load(au.churchId, id);
      return this.repos.headcount.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      let data: any;
      if (req.query.serviceTimeId !== undefined) data = await this.repos.headcount.loadByServiceTimeId(au.churchId, req.query.serviceTimeId.toString());
      else if (req.query.groupId !== undefined) data = await this.repos.headcount.loadByGroupId(au.churchId, req.query.groupId.toString());
      else data = await this.repos.headcount.loadAll(au.churchId);
      return this.repos.headcount.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Headcount[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      const items = Array.isArray(req.body) ? req.body : [];
      for (const item of items) {
        const value = Number(item.value);
        if (!Number.isInteger(value) || value < 0) return this.json({ error: "value must be a whole number of zero or more" }, 400);
        if (!item.headcountDate) return this.json({ error: "headcountDate is required" }, 400);
        if (!item.serviceTimeId && !item.serviceId && !item.groupId) return this.json({ error: "a service, service time or group is required" }, 400);
        item.value = value;
      }
      const promises: Promise<Headcount>[] = [];
      items.forEach((item) => {
        item.churchId = au.churchId;
        if (!item.id) item.enteredBy = au.personId;
        promises.push(this.repos.headcount.save(item));
      });
      const result = await Promise.all(promises);
      return this.repos.headcount.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      await this.repos.headcount.delete(au.churchId, id);
      return {};
    });
  }
}
