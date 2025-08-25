import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { GroupServiceTime } from "../models";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/groupservicetimes")
export class GroupServiceTimeController extends AttendanceBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.groupServiceTime.load(au.churchId, id);
      const dataArray = (data as any)?.rows || data || [];
      return this.repositories.groupServiceTime.convertAllToModel(au.churchId, dataArray);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      let result = null;
      if (req.query.groupId !== undefined) result = await this.repositories.groupServiceTime.loadWithServiceNames(au.churchId, req.query.groupId.toString());
      else result = await this.repositories.groupServiceTime.loadAll(au.churchId);
      const resultArray = (result as any)?.rows || result || [];
      return this.repositories.groupServiceTime.convertAllToModel(au.churchId, resultArray);
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
          promises.push(this.repositories.groupServiceTime.save(groupservicetime));
        });
        const result = await Promise.all(promises);
        return this.repositories.groupServiceTime.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.services.edit)) return this.json({}, 401);
      else {
        await this.repositories.groupServiceTime.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
