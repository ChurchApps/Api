import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { Report } from "../models/index.js";

@controller("/commons/reports")
export class CommonsReportController extends CommonsBaseController {
  @httpPost("/")
  public async create(req: express.Request<{}, {}, Report>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const b = req.body;
      if (!b.contentText || !b.details || !b.name || !b.email || !b.signature) return this.json({ errors: ["All fields are required"] }, 400);
      const report = await this.repos.report.create({
        assetId: b.assetId,
        contentText: b.contentText,
        reporterRole: b.reporterRole,
        details: b.details,
        name: b.name,
        email: b.email,
        signature: b.signature
      });
      return { id: report.id };
    });
  }
}
