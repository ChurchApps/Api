import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { GroupServiceTime } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/attendance/groupservicetimes")
export class GroupServiceTimeController extends AttendanceBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.groupServiceTime.load(au.churchId, id);
      return this.repos.groupServiceTime.convertToModel(au.churchId, data as any);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      let result = null;
      if (req.query.groupId !== undefined) result = await this.repos.groupServiceTime.loadWithServiceNames(au.churchId, req.query.groupId.toString());
      else result = await this.repos.groupServiceTime.loadAll(au.churchId);
      return this.repos.groupServiceTime.convertAllToModel(au.churchId, result as any);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, GroupServiceTime[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      else {
        const promises: Promise<GroupServiceTime>[] = [];
        req.body.forEach((groupservicetime) => {
          groupservicetime.churchId = au.churchId;
          promises.push(this.repos.groupServiceTime.save(groupservicetime));
        });
        const result = await Promise.all(promises);
        return this.repos.groupServiceTime.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      else {
        await this.repos.groupServiceTime.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
