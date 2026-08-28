import { controller, httpPost } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { ipHash } from "../helpers/index.js";
import { Report } from "../models/index.js";

const REASONS = ["copyright", "policy", "quality", "other"];
const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 3600000;
// ponytail: per-process limiter — move to a table if abuse ever shows up across Lambda instances
const recent = new Map<string, number[]>();

@controller("/commons/reports")
export class CommonsReportController extends CommonsBaseController {
  @httpPost("/")
  public async create(req: express.Request<{}, {}, Report>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const b = req.body || {};
      const isWriter = !!au.id && b.reporterRole === "writer";
      const reason = isWriter ? (b.reason === "other" ? "other" : "copyright") : (REASONS.includes(b.reason || "") ? b.reason : "copyright");
      if (isWriter) {
        if (!b.assetId || !b.details) return this.json({ errors: ["assetId and details are required"] }, 400);
      } else {
        if (!b.contentText || !b.details) return this.json({ errors: ["contentText and details are required"] }, 400);
        if (reason === "copyright" && (!b.name || !b.email || !b.signature || !b.reporterRole)) return this.json({ errors: ["name, email, signature and reporterRole are required for copyright reports"] }, 400);
      }
      const key = ipHash(req);
      const now = Date.now();
      const hits = (recent.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
      if (hits.length >= RATE_LIMIT) return this.json({ errors: ["Too many reports from this address — try again later"] }, 429);
      recent.set(key, [...hits, now]);
      let contentText = b.contentText;
      if (isWriter && !contentText && b.assetId) contentText = (await this.repos.asset.loadById(b.assetId))?.name;
      const report = await this.repos.report.create({
        assetId: b.assetId,
        contentText: String(contentText || "writer request").slice(0, 255),
        reason,
        reporterUserId: au.id || undefined,
        reporterRole: b.reporterRole,
        details: b.details,
        name: b.name || [au.firstName, au.lastName].filter(Boolean).join(" ") || undefined,
        email: b.email || au.email || undefined,
        signature: b.signature
      });
      return { id: report.id };
    });
  }
}
