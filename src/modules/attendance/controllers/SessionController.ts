import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { Session } from "../models/index.js";

@controller("/attendance/sessions")
export class SessionController extends AttendanceBaseController {

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      const data = await this.repos.session.load(au.churchId, id);
      return this.repos.session.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const groupId = req.query.groupId?.toString();
      const isGroupLeader = groupId && au.leaderGroupIds?.includes(groupId);
      if (!au.checkAccess(Permissions.attendance.view) && !isGroupLeader) return this.json({}, 401);
      else {
        let result;
        if (groupId === undefined) result = await this.repos.session.loadAll(au.churchId);
        else {
          result = await this.repos.session.loadByGroupIdWithNames(au.churchId, groupId);
        }
        return this.repos.session.convertAllToModel(au.churchId, result as any);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Session[]>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      // Check if user is a leader of any of the groups being saved
      const sessions = req.body;
      const allGroupIds = sessions.map(s => s.groupId).filter(Boolean);
      const isGroupLeader = allGroupIds.length > 0 && allGroupIds.every(gid => au.leaderGroupIds?.includes(gid));

      if (!au.checkAccess(Permissions.attendance.edit) && !isGroupLeader) return this.json({}, 401);
      else {
        const promises: Promise<Session>[] = [];
        sessions.forEach((session) => {
          session.churchId = au.churchId;
          promises.push(this.repos.session.save(session));
        });
        const result = await Promise.all(promises);
        return this.repos.session.convertAllToModel(au.churchId, result);
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.edit)) return this.json({}, 401);
      await this.repos.session.delete(au.churchId, id);
      return {};
    });
  }
}
