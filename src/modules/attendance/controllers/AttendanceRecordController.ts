import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { AttendanceBaseController } from "./AttendanceBaseController";
import { Permissions } from "../../../shared/helpers";

@controller("/attendance/attendancerecords")
export class AttendanceRecordController extends AttendanceBaseController {
  @httpGet("/tree")
  public async tree(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      const repos = await this.getAttendanceRepositories();
      const data = await repos.attendance.loadTree(au.churchId);
      const dataArray = (data as any)?.rows || data || [];
      return repos.attendance.convertAllToModel(au.churchId, dataArray);
    });
  }

  @httpGet("/trend")
  public async trend(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.viewSummary)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const campusId = req.query.campusId === undefined ? "" : req.query.campusId.toString();
        const serviceId = req.query.serviceId === undefined ? "" : req.query.serviceId.toString();
        const serviceTimeId = req.query.serviceTimeId === undefined ? "" : req.query.serviceTimeId.toString();
        const groupId = req.query.groupId === undefined ? "" : req.query.groupId.toString();
        const data = await repos.attendance.loadTrend(au.churchId, campusId, serviceId, serviceTimeId, groupId);
        return data;
      }
    });
  }

  @httpGet("/groups")
  public async group(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        const serviceId = req.query.serviceId === undefined ? "" : req.query.serviceId.toString();
        const week = req.query.week === undefined ? new Date() : Date.parse(req.query.week.toString());
        const data = await repos.attendance.loadGroups(au.churchId, serviceId, new Date(week));
        return data;
      }
    });
  }

  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<unknown> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.attendance.view)) return this.json({}, 401);
      else {
        const repos = await this.getAttendanceRepositories();
        let result = null;
        const campusId = req.query.campusId === undefined ? "" : req.query.campusId.toString();
        const serviceId = req.query.serviceId === undefined ? "" : req.query.serviceId.toString();
        const serviceTimeId = req.query.serviceTimeId === undefined ? "" : req.query.serviceTimeId.toString();
        const groupId = req.query.groupId === undefined ? "" : req.query.groupId.toString();
        const startDate = req.query.startDate !== undefined && new Date(req.query.startDate.toString());
        const endDate = req.query.endDate !== undefined && new Date(req.query.endDate.toString());

        if (campusId !== "") {
          result = await repos.attendance.loadByCampusId(au.churchId, campusId, startDate, endDate);
        } else if (serviceId !== "") {
          result = await repos.attendance.loadByServiceId(au.churchId, serviceId, startDate, endDate);
        } else if (serviceTimeId !== "") {
          result = await repos.attendance.loadByServiceTimeId(au.churchId, serviceTimeId, startDate, endDate);
        } else if (groupId !== "") {
          result = await repos.attendance.loadByGroupId(au.churchId, groupId, startDate, endDate);
        } else {
          result = await repos.visit.loadAllByDate(au.churchId, startDate, endDate);
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
          const repos = await this.getAttendanceRepositories();
          result = await repos.attendance.loadForPerson(au.churchId, personId);
        }
      }
      const repos = await this.getAttendanceRepositories();
      const resultArray = (result as any)?.rows || result || [];
      return repos.attendance.convertAllToModel(au.churchId, resultArray);
    });
  }
}
