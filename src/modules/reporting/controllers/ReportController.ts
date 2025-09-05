import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ReportingBaseController } from "./ReportingBaseController";
import { Report, ReportResult, Permission } from "../models";
import fs from "fs";
import path from "path";
import { ArrayHelper, AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { ReportResultHelper, RunReportHelper } from "../helpers";

@controller("/reporting/reports")
export class ReportController extends ReportingBaseController {
  @httpGet("/groupAttendanceDownload/run")
  public async groupAttDownload(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const reportPath = path.join(process.cwd(), "reports", "groupAttendanceDownload.json");

      if (!fs.existsSync(reportPath)) {
        return this.json({ error: "Report not found" }, 404);
      }

      const contents = fs.readFileSync(reportPath, "utf8");
      const report: Report = JSON.parse(contents);

      if (!this.checkPermissions(report, au)) return this.json({ error: "Insufficient permissions" }, 401);

      this.populateRootParameters(report, au, req);
      await RunReportHelper.runAllQueries(report);

      const resultTable = this.combineGroupAttDwnldResult(report);
      return this.json(this.convertToResult(report, resultTable));
    });
  }

  @httpGet("/:keyName")
  public async get(@requestParam("keyName") keyName: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      const reportPath = path.join(process.cwd(), "reports", `${keyName}.json`);

      if (!fs.existsSync(reportPath)) {
        return this.json({ error: "Report not found" }, 404);
      }

      const contents = fs.readFileSync(reportPath, "utf8");
      const report: Report = JSON.parse(contents);
      return this.json(report);
    });
  }

  @httpGet("/:keyName/run")
  public async run(@requestParam("keyName") keyName: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const reportPath = path.join(process.cwd(), "reports", `${keyName}.json`);

      if (!fs.existsSync(reportPath)) {
        return this.json({ error: "Report not found" }, 404);
      }

      const contents = fs.readFileSync(reportPath, "utf8");
      const report: Report = JSON.parse(contents);

      if (!this.checkPermissions(report, au)) return this.json({ error: "Insufficient permissions" }, 401);

      this.populateRootParameters(report, au, req);
      await RunReportHelper.runAllQueries(report);

      const resultTable = ReportResultHelper.combineResults(report);
      return this.json(this.convertToResult(report, resultTable));
    });
  }

  private checkPermissions(report: Report, au: AuthenticatedUser) {
    if (!report.permissions || report.permissions.length === 0) return true;

    let result = true;
    report.permissions.forEach((rpg) => {
      const groupResult = this.checkGroup(rpg.requireOne, au);
      if (!groupResult) result = false;
    });
    return result;
  }

  private checkGroup(pa: Permission[], au: AuthenticatedUser) {
    if (!pa || pa.length === 0) return true;

    let result = false;
    pa.forEach((p) => {
      const ip: IPermission = { action: p.action, contentType: p.contentType, apiName: p.api };
      if (au.checkAccess(ip)) result = true;
    });
    return result;
  }

  private convertToResult(report: Report, table: any[]) {
    const result: ReportResult = {
      displayName: report.displayName,
      description: report.description,
      outputs: report.outputs,
      table: table
    };
    return result;
  }

  private populateRootParameters(report: Report, au: AuthenticatedUser, req: express.Request<{}, {}, null>) {
    report.parameters?.forEach((p) => {
      if (p.source === "au") {
        if (p.sourceKey === "churchId") p.value = au.churchId;
      } else {
        p.value = req.query[p.keyName]?.toString() || "";
      }
    });
  }

  private combineGroupAttDwnldResult(report: Report) {
    const result: any[] = [];
    const serviceArray: any[] = [];
    const { value: attendance } = ArrayHelper.getOne(report.queries, "keyName", "main") || {};
    const { value: groups } = ArrayHelper.getOne(report.queries, "keyName", "groups") || {};
    const { value: groupMembers } = ArrayHelper.getOne(report.queries, "keyName", "groupMembers") || {};
    const { value: people } = ArrayHelper.getOne(report.queries, "keyName", "people") || {};

    if (!attendance || !groups || !groupMembers || !people) {
      return result;
    }

    const serviceIds = ArrayHelper.getUniqueValues(attendance, "serviceId");
    serviceIds?.forEach((id) => {
      const timeIds = ArrayHelper.getAll(attendance, "serviceId", id);
      const uniqueTimeIds = ArrayHelper.getUniqueValues(timeIds, "serviceTimeId");
      uniqueTimeIds?.forEach((tId) => {
        const att = ArrayHelper.getOne(timeIds, "serviceTimeId", tId);
        serviceArray.push({
          name: att.serviceName + "-" + att.serviceTimeName,
          value: att.serviceId + "//" + att.serviceTimeId
        });
      });
    });

    groups?.forEach((g: any) => {
      const getGroupMembers = ArrayHelper.getAll(groupMembers, "groupId", g.id);
      getGroupMembers?.forEach((gm: any) => {
        const person = ArrayHelper.getOne(people, "id", gm.personId);
        const attendanceStatus: any = {};
        serviceArray?.forEach((ser) => {
          const serId = ser?.value.split("//")[0];
          const serTimeId = ser?.value.split("//")[1];
          const getValue = attendance.filter((a: any) => a.groupId === g.id && a.personId === person.id && a.serviceId === serId && a.serviceTimeId === serTimeId);
          if (getValue.length > 0) {
            attendanceStatus[ser.name] = "present";
          } else {
            attendanceStatus[ser.name] = "absent";
          }
        });

        result.push({
          displayName: person.displayName,
          personId: person.id,
          groupName: g.groupName,
          groupId: g.id,
          ...attendanceStatus
        });
      });
    });

    return result;
  }
}
