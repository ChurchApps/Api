import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { Session } from "../models";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/sessions")
export class SessionController extends AttendanceBaseController {
  @httpGet("/:id")
  public async get(
    @requestParam("id") id: string,
    req: express.Request<{}, {}, null>,
    res: express.Response
  ): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        return this.repositories.session.convertToModel(au.churchId, await this.repositories.session.load(au.churchId, id));
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        let result;
        if (req.query.groupId === undefined) result = await this.repositories.session.loadAll(au.churchId);
        else {
          const groupId = req.query.groupId.toString();
          result = await this.repositories.session.loadByGroupIdWithNames(au.churchId, groupId);
        }
        return this.repositories.session.convertAllToModel(au.churchId, result as any);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Session[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Session>[] = [];
        req.body.forEach((session) => {
          session.churchId = au.churchId;
          promises.push(this.repositories.session.save(session));
        });
        const result = await Promise.all(promises);
        return this.repositories.session.convertAllToModel(au.churchId, result);
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
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      else {
        await this.repositories.session.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
