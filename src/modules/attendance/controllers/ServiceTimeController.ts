import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { AttendanceCrudController } from "./AttendanceCrudController";
import { ServiceTime, GroupServiceTime } from "../models";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/servicetimes")
export class ServiceTimeController extends AttendanceCrudController {
  protected crudSettings = {
    repoKey: "serviceTime",
    permissions: { view: null, edit: Permissions.services.edit },
    routes: ["getById", "post", "delete"] as const
  };
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const campusId = req.query.campusId.toString();
      const serviceId = req.query.serviceId.toString();
      const data = await this.repositories.serviceTime.loadByChurchCampusService(au.churchId, campusId, serviceId);
      return this.repositories.serviceTime.convertAllToModel(au.churchId, data as any);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      // return await this.repositories.serviceTime.loadAll(au.churchId);
      let data = null;
      if (req.query.serviceId !== undefined) data = await this.repositories.serviceTime.loadNamesByServiceId(au.churchId, req.query.serviceId.toString());
      else data = await this.repositories.serviceTime.loadNamesWithCampusService(au.churchId);
      const result: ServiceTime[] = this.repositories.serviceTime.convertAllToModel(au.churchId, data as any);
      if (result.length > 0 && this.include(req, "groups")) await this.appendGroups(au.churchId, result);
      return result;
    });
  }

  private async appendGroups(churchId: string, times: ServiceTime[]) {
    const timeIds: string[] = [];
    times.forEach((t) => {
      timeIds.push(t.id);
    });
    const allGroupServiceTimes: GroupServiceTime[] = (await this.repositories.groupServiceTime.loadByServiceTimeIds(churchId, timeIds)) as any;
    const allGroupIds: string[] = [];
    if (allGroupServiceTimes) {
      allGroupServiceTimes.forEach((gst) => {
        if (allGroupIds.indexOf(gst.groupId) === -1) allGroupIds.push(gst.groupId);
      });
    }
  }
}
