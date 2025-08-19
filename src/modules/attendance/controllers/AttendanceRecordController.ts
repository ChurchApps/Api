import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/attendancerecords")
export class AttendanceRecordController extends AttendanceBaseController {
  @httpGet("/tree")
  public async tree(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repositories.attendance.loadTree(au.churchId);
      const dataArray = (data as any)?.rows || data || [];
      return this.repositories.attendance.convertAllToModel(au.churchId, dataArray);
    });
  }

  @httpGet("/trend")
  public async trend(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.viewSummary)) return this.json({}, 401);
      else {
        const campusId = req.query.campusId === undefined ? "" : req.query.campusId.toString();
        const serviceId = req.query.serviceId === undefined ? "" : req.query.serviceId.toString();
        const serviceTimeId = req.query.serviceTimeId === undefined ? "" : req.query.serviceTimeId.toString();
        const groupId = req.query.groupId === undefined ? "" : req.query.groupId.toString();
        const data = await this.repositories.attendance.loadTrend(au.churchId, campusId, serviceId, serviceTimeId, groupId);
        return data;
      }
    });
  }

  @httpGet("/groups")
  public async group(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        const serviceId = req.query.serviceId === undefined ? "" : req.query.serviceId.toString();
        const week = req.query.week === undefined ? new Date() : Date.parse(req.query.week.toString());
        const data = await this.repositories.attendance.loadGroups(au.churchId, serviceId, new Date(week));
        return data;
      }
    });
  }

  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        let result = null;
        const campusId = req.query.campusId === undefined ? "" : req.query.campusId.toString();
        const serviceId = req.query.serviceId === undefined ? "" : req.query.serviceId.toString();
        const serviceTimeId = req.query.serviceTimeId === undefined ? "" : req.query.serviceTimeId.toString();
        const groupId = req.query.groupId === undefined ? "" : req.query.groupId.toString();
        const startDate = req.query.startDate !== undefined && new Date(req.query.startDate.toString());
        const endDate = req.query.endDate !== undefined && new Date(req.query.endDate.toString());

        if (campusId !== "") {
          result = await this.repositories.attendance.loadByCampusId(au.churchId, campusId, startDate, endDate);
        } else if (serviceId !== "") {
          result = await this.repositories.attendance.loadByServiceId(au.churchId, serviceId, startDate, endDate);
        } else if (serviceTimeId !== "") {
          result = await this.repositories.attendance.loadByServiceTimeId(au.churchId, serviceTimeId, startDate, endDate);
        } else if (groupId !== "") {
          result = await this.repositories.attendance.loadByGroupId(au.churchId, groupId, startDate, endDate);
        } else {
          result = await this.repositories.visit.loadAllByDate(au.churchId, startDate, endDate);
        }

        return result;
      }
    });
  }

  @httpGet("/")
  public async load(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const personId = req.query.personId === undefined ? "" : req.query.personId.toString();
      let result = null;

      if (personId !== "") {
        if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
        else {
          result = await this.repositories.attendance.loadForPerson(au.churchId, personId);
        }
      }
      const resultArray = (result as any)?.rows || result || [];
      return this.repositories.attendance.convertAllToModel(au.churchId, resultArray);
    });
  }
}
