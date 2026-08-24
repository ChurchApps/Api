import { controller, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { ASSET_TYPES, COMMONS_PRODUCT_LABELS } from "@churchapps/helpers";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { ContentLibraryHelper, PublishHelper, QualityHelper, userNames } from "../helpers/index.js";
import { Repos } from "../repositories/index.js";

const REJECT_REASONS = ["quality", "duplicate", "licensing", "offtopic", "incomplete", "other"];
const RESOLUTIONS = ["upheld", "dismissed", "duplicate"];
const REMOVE_REASONS = ["copyright", "policy"];

@controller("/commons/admin")
export class CommonsAdminController extends CommonsBaseController {
  // lets the SPA decide what to render without provoking a 401 on every load
  @httpGet("/status")
  public async status(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => ({ admin: !!au.id && au.checkAccess(Permissions.server.admin) }));
  }

  @httpGet("/types")
  public async types(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => Object.values(ASSET_TYPES).map((t) => ({ key: t.key, label: t.label, product: t.product, productLabel: COMMONS_PRODUCT_LABELS[t.product], hasPreview: !!t.previewUrl })));
  }

  /** The one queue: every pending submission across every product, oldest first. */
  @httpGet("/submissions")
  public async submissions(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const product = req.query.product?.toString();
      let rows = await this.repos.submission.loadQueue({ status: req.query.status?.toString() || "pending", assetType: req.query.assetType?.toString(), page: Number(req.query.page) || 1 });
      if (product) rows = rows.filter((r) => ASSET_TYPES[r.assetType || ""]?.product === product);
      const names = await userNames(rows.flatMap((r) => [r.submittedBy, r.publisherUserId]));
      const stats: Record<string, { total: number; approved: number }> = {};
      const out = [];
      for (const r of rows) {
        stats[r.submittedBy || ""] ||= await this.repos.submission.countSubmitterStats(r.submittedBy || "");
        const files = await this.repos.assetFile.loadBySubmission(r.id || "");
        const def = ASSET_TYPES[r.assetType || ""];
        out.push({
          ...r,
          payload: undefined,
          typeLabel: def?.label || r.assetType,
          product: def?.product,
          productLabel: def ? COMMONS_PRODUCT_LABELS[def.product] : undefined,
          submittedByName: names[r.submittedBy || ""],
          publisherName: names[r.publisherUserId || ""],
          submitterStats: stats[r.submittedBy || ""],
          isNewAsset: !r.publishedSubmissionId,
          isThirdParty: r.publisherUserId !== r.submittedBy,
          filesChanged: PublishHelper.fileSummary(files)
        });
      }
      return out;
    });
  }

  @httpGet("/submissions/:id")
  public async submission(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const sub = await this.repos.submission.loadById(String(req.params.id));
      if (!sub) return this.json({}, 404);
      const asset = await this.repos.asset.loadById(sub.assetId || "");
      if (!asset) return this.json({}, 404);
      const apiBase = ContentLibraryHelper.requestApiBase(req);
      const proposed = await this.repos.assetFile.loadBySubmission(sub.id || "");
      const files = [];
      for (const f of proposed) files.push({ ...f, url: f.action === "remove" ? undefined : await ContentLibraryHelper.signedPendingUrl(sub.id || "", f.name || "", apiBase) });
      const liveFiles = await this.repos.assetFile.loadLive(asset.id || "");
      const livePayload = asset.publishedSubmissionId ? await PublishHelper.editablePayload(this.repos, asset) : undefined;
      const names = await userNames([sub.submittedBy, asset.publisherUserId]);
      const def = ASSET_TYPES[asset.assetType || ""];
      const previewUrl = def?.previewUrl?.replace("{submissionId}", sub.id || "").replace("{token}", ContentLibraryHelper.previewToken(sub.id || ""));
      return {
        ...sub,
        typeLabel: def?.label || asset.assetType,
        product: def?.product,
        assetType: asset.assetType,
        assetName: asset.name,
        assetStatus: asset.status,
        isNewAsset: !asset.publishedSubmissionId,
        isThirdParty: asset.publisherUserId !== sub.submittedBy,
        submittedByName: names[sub.submittedBy || ""],
        submitterStats: await this.repos.submission.countSubmitterStats(sub.submittedBy || ""),
        files,
        live: { ...asset, publisherName: names[asset.publisherUserId || ""], files: liveFiles, fileUrls: ContentLibraryHelper.fileUrls(asset, liveFiles), payload: livePayload },
        diff: { fields: PublishHelper.diffFields(livePayload, sub.payload), files: PublishHelper.fileSummary(proposed) },
        previewUrl
      };
    });
  }

  @httpPost("/submissions/:id/approve")
  public async approve(req: express.Request<{ id: string }, {}, { note?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const sub = await this.repos.submission.loadById(String(req.params.id));
      if (!sub) return this.json({}, 404);
      if (sub.status !== "pending") return this.json({ errors: [`submission is ${sub.status}`] }, 400);
      const asset = await this.repos.asset.loadById(sub.assetId || "");
      if (!asset || asset.status === "removed") return this.json({ errors: ["asset was removed"] }, 400);
      await PublishHelper.approve(this.repos, sub, asset, au.id, req.body?.note?.slice(0, 500));
      return { status: "approved", assetId: asset.id };
    });
  }

  @httpPost("/submissions/:id/reject")
  public async reject(req: express.Request<{ id: string }, {}, { reason?: string; note?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const reason = String(req.body?.reason || "");
      const note = String(req.body?.note || "").trim().slice(0, 500);
      if (!REJECT_REASONS.includes(reason) || !note) return this.json({ errors: ["reason and note are required"] }, 400);
      const sub = await this.repos.submission.loadById(String(req.params.id));
      if (!sub) return this.json({}, 404);
      if (sub.status !== "pending") return this.json({ errors: [`submission is ${sub.status}`] }, 400);
      const asset = await this.repos.asset.loadById(sub.assetId || "");
      await PublishHelper.reject(this.repos, sub, asset, au.id, reason, note);
      return { status: "rejected" };
    });
  }

  // signature-gated rather than JWT-gated: review players and <img> tags never send the Authorization header
  @httpGet("/pending-files/:submissionId/:name")
  public async pendingFile(req: express.Request, res: express.Response): Promise<any> {
    const submissionId = String(req.params.submissionId);
    const name = String(req.params.name);
    if (!ContentLibraryHelper.verify(submissionId, name, Number(req.query.exp), String(req.query.sig || ""))) {
      res.status(404).json({});
      return;
    }
    const repos = await this.getRepos<Repos>();
    const sub = await repos.submission.loadById(submissionId);
    if (!sub || !["draft", "pending"].includes(sub.status || "")) {
      res.status(404).json({});
      return;
    }
    const file = await ContentLibraryHelper.readPending(submissionId, name);
    if (!file) {
      res.status(404).json({});
      return;
    }
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(file.buffer);
  }

  @httpGet("/reports")
  public async reports(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const reports = await this.repos.report.loadAll(req.query.status?.toString(), req.query.reason?.toString());
      const assets = await this.repos.asset.loadByIds([...new Set(reports.map((r) => r.assetId).filter((id): id is string => !!id))]);
      const byId = new Map(assets.map((a) => [a.id, a]));
      return reports.map((r) => ({ ...r, assetName: byId.get(r.assetId || "")?.name, assetStatus: byId.get(r.assetId || "")?.status }));
    });
  }

  @httpPost("/reports/:id/claim")
  public async claim(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const report = await this.repos.report.loadById(String(req.params.id));
      if (!report) return this.json({}, 404);
      if (report.status !== "open") return this.json({ errors: [`report is ${report.status}`] }, 400);
      await this.repos.report.update(report.id || "", { status: "reviewing", reviewedBy: au.id });
      return { status: "reviewing" };
    });
  }

  @httpPost("/reports/:id/resolve")
  public async resolve(req: express.Request<{ id: string }, {}, { resolution?: string; note?: string; action?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const resolution = String(req.body?.resolution || "");
      const action = String(req.body?.action || "none");
      if (!RESOLUTIONS.includes(resolution) || !["none", "unpublish", "remove"].includes(action)) return this.json({ errors: ["resolution and action are required"] }, 400);
      const report = await this.repos.report.loadById(String(req.params.id));
      if (!report) return this.json({}, 404);
      if (report.status === "resolved") return this.json({ errors: ["report is resolved"] }, 400);
      const asset = report.assetId ? await this.repos.asset.loadById(report.assetId) : undefined;
      if (action !== "none" && !asset) return this.json({ errors: ["report is not linked to an asset"] }, 400);
      const reason = report.reason === "copyright" ? "copyright" : "policy";
      if (asset && action === "remove" && asset.status !== "removed") await PublishHelper.remove(this.repos, asset, reason);
      if (asset && action === "unpublish" && asset.status === "published") await this.repos.asset.update(asset.id || "", { status: "unpublished", unpublishedAt: new Date(), removedReason: reason });
      await this.repos.report.update(report.id || "", { status: "resolved", resolution, resolutionNote: String(req.body?.note || "").slice(0, 500), reviewedBy: au.id, reviewedAt: new Date() });
      return { status: "resolved" };
    });
  }

  @httpGet("/assets")
  public async assets(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const assets = await this.repos.asset.adminSearch({ q: req.query.q?.toString(), status: req.query.status?.toString(), assetType: req.query.assetType?.toString(), page: Number(req.query.page) || 1 });
      const names = await userNames(assets.map((a) => a.publisherUserId));
      return assets.map((a) => ({ ...a, publisherName: names[a.publisherUserId || ""], typeLabel: ASSET_TYPES[a.assetType || ""]?.label || a.assetType }));
    });
  }

  @httpPost("/assets/:id/unpublish")
  public async unpublish(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      if (asset.status !== "published") return this.json({ errors: [`asset is ${asset.status}`] }, 400);
      await this.repos.asset.update(asset.id || "", { status: "unpublished", unpublishedAt: new Date(), removedReason: "policy" });
      return { status: "unpublished" };
    });
  }

  @httpPost("/assets/:id/republish")
  public async republish(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      if (asset.status !== "unpublished") return this.json({ errors: [`asset is ${asset.status}`] }, 400);
      await this.repos.asset.update(asset.id || "", { status: "published", unpublishedAt: null as any, removedReason: null as any });
      return { status: "published" };
    });
  }

  @httpPost("/assets/:id/remove")
  public async remove(req: express.Request<{ id: string }, {}, { reason?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const reason = String(req.body?.reason || "");
      if (!REMOVE_REASONS.includes(reason)) return this.json({ errors: ["reason must be copyright or policy"] }, 400);
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      if (asset.status === "removed") return this.json({ errors: ["asset is already removed"] }, 400);
      await PublishHelper.remove(this.repos, asset, reason);
      return { status: "removed" };
    });
  }

  @httpPost("/assets/:id/feature")
  public async feature(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      const featured = !asset.featured;
      await this.repos.asset.update(asset.id || "", { featured });
      return { featured };
    });
  }

  @httpPost("/score-missing")
  public async scoreMissing(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      // ponytail: 8 per call fits the 30s Lambda; caller loops until remaining is 0
      const songs = await this.repos.song.loadUnscored(8);
      let scored = 0;
      for (const s of songs) {
        const files = await this.repos.assetFile.loadLive(s.id || "");
        const fields = await QualityHelper.score({ ...s, fileRoles: files.map((f) => (f.name || "").replace(/\.[^.]+$/, "")) });
        if (fields.qualityScore != null) {
          await this.repos.song.update(s.id || "", fields);
          scored++;
        }
      }
      return { scored, remaining: (await this.repos.song.loadUnscored(1)).length };
    });
  }
}
