import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ReportingBaseController } from "./ReportingBaseController.js";
import { Report, ReportResult, Permission } from "../models/index.js";
import fs from "fs";
import path from "path";
import { AuthenticatedUser, IPermission } from "@churchapps/apihelper";
import { GroupAttendanceDownloadHelper, ReportResultHelper, RunReportHelper } from "../helpers/index.js";

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

      const resultTable = GroupAttendanceDownloadHelper.combine(report);
      return this.json(this.convertToResult(report, resultTable));
    });
  }

  @httpGet("/:keyName")
  public async get(@requestParam("keyName") keyName: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      if (!/^[A-Za-z0-9_-]+$/.test(keyName)) return this.json({}, 400);
      const reportPath = path.join(process.cwd(), "reports", `${keyName}.json`);
      if (!path.resolve(reportPath).startsWith(path.resolve(process.cwd(), "reports") + path.sep)) return this.json({}, 400);

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
      if (!/^[A-Za-z0-9_-]+$/.test(keyName)) return this.json({}, 400);
      const reportPath = path.join(process.cwd(), "reports", `${keyName}.json`);
      if (!path.resolve(reportPath).startsWith(path.resolve(process.cwd(), "reports") + path.sep)) return this.json({}, 400);

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
}
