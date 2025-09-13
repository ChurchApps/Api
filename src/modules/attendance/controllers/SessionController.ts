import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { AttendanceCrudController } from "./AttendanceCrudController";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/sessions")
export class SessionController extends AttendanceCrudController {
  protected crudSettings = {
    repoKey: "session",
    permissions: { view: Permissions.attendance.view, edit: Permissions.attendance.edit },
    routes: ["getById", "post", "delete"] as const
  };
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
}
