import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { LabelTemplate } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/attendance/labeltemplates")
export class LabelTemplateController extends AttendanceBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view) && !au.checkAccess(Permissions.attendance.checkin)) return this.json({}, 401);
      else return this.repos.labelTemplate.convertToModel(au.churchId, await this.repos.labelTemplate.load(au.churchId, id));
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view) && !au.checkAccess(Permissions.attendance.checkin)) return this.json({}, 401);
      else return this.repos.labelTemplate.convertAllToModel(au.churchId, (await this.repos.labelTemplate.loadAll(au.churchId)) as any);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, LabelTemplate[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const result: LabelTemplate[] = [];
        for (const template of req.body) {
          template.churchId = au.churchId;
          const saved = await this.repos.labelTemplate.save(template);
          if (saved.isDefault) await this.repos.labelTemplate.clearOtherDefaults(au.churchId, saved.labelType, saved.id);
          result.push(saved);
        }
        return this.repos.labelTemplate.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        await this.repos.labelTemplate.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
