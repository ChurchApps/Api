import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController.js";

// DEPRECATED: read-only/frozen — campuses are mastered in the membership module
// (/membership/campuses). The attendance `campuses` table is no longer written to
// (the create/update/delete endpoints were removed); only these GET endpoints
// remain so legacy readers (e.g. B1Checkin) keep working. This controller, the
// CampusRepo, the Campus model, and the `campuses` table are slated for deletion
// once those legacy readers are migrated off the attendance campus joins.
@controller("/attendance/campuses")
export class CampusController extends AttendanceBaseController {

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.campus.load(au.churchId, id);
      return this.repos.campus.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.campus.loadAll(au.churchId);
      return this.repos.campus.convertAllToModel(au.churchId, data);
    });
  }
}
