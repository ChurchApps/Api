import { controller, httpGet, httpPost, httpPut } from "inversify-express-utils";
import express from "express";
import { fileRole } from "@churchapps/helpers";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { ContentLibraryHelper, PublishHelper, recordAssetDownload, userNames } from "../helpers/index.js";
import { Asset, AssetFile } from "../models/index.js";

const MIN_RATINGS_SHOWN = 3;

@controller("/commons/assets")
export class CommonsAssetController extends CommonsBaseController {
  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 50;
      const { assets, total } = await this.repos.asset.search({
        assetType: req.query.assetType?.toString(),
        tags: req.query.tags?.toString(),
        language: req.query.language?.toString(),
        license: req.query.license?.toString(),
        featured: req.query.featured === "true",
        q: req.query.q?.toString(),
        sort: req.query.sort?.toString(),
        page,
        pageSize
      });
      return { assets: await this.publicViews(assets), total, page, pageSize };
    });
  }

  @httpGet("/saved")
  public async saved(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      const ids = await this.repos.rating.loadSavedAssetIds(au.id);
      const assets = (await this.repos.asset.loadByIds(ids)).filter((a) => a.status === "published");
      const byId = new Map(assets.map((a) => [a.id, a]));
      return await this.publicViews(ids.map((id) => byId.get(id)).filter((a): a is Asset => !!a));
    });
  }

  @httpGet("/mine")
  public async mine(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      const assets = await this.repos.asset.loadByPublisher(au.id);
      const views = await this.publicViews(assets);
      for (const v of views) v.hasPendingSubmission = !!(await this.repos.submission.loadPendingForAsset(v.id || ""));
      return views;
    });
  }

  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      if (asset.status === "removed") return this.json({ removedReason: asset.removedReason }, 410);
      const privileged = !!au.id && (au.id === asset.publisherUserId || au.checkAccess(Permissions.server.admin));
      if (asset.status !== "published" && !privileged) return this.json({}, 404);
      const [view] = await this.publicViews([asset]);
      view.version = await this.repos.submission.countApproved(asset.id || "");
      view.hasPendingSubmission = !!(await this.repos.submission.loadPendingForAsset(asset.id || ""));
      if (asset.assetType === "song") {
        const s = await this.repos.song.loadSatellite(asset.id || "");
        if (s) {
          const { qualityDetail: _q, proAnswer: _p, qualityScore: _qs, ...detail } = s;
          view.detail = detail;
        }
      }
      if (au.id) {
        const mine = await this.repos.rating.load(asset.id || "", au.id);
        view.myRating = mine?.stars ?? null;
        view.mySaved = !!mine?.saved;
      }
      return view;
    });
  }

  @httpGet("/:id/history")
  public async history(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset || asset.status === "pending") return this.json({}, 404);
      const approved = await this.repos.submission.loadHistory(asset.id || "");
      const names = await userNames(approved.map((s) => s.submittedBy));
      return approved.map((s, i) => ({
        submissionId: s.id,
        submittedBy: s.submittedBy,
        submittedByName: names[s.submittedBy || ""],
        submittedAt: s.submittedAt,
        approvedAt: s.reviewedAt,
        note: s.note,
        filesChanged: s.filesChanged || [],
        fieldsChanged: i === 0 ? [] : PublishHelper.diffFields(approved[i - 1].payload, s.payload).map((d) => d.key)
      }));
    });
  }

  @httpGet("/:id/editable")
  public async editable(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async () => {
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset || asset.status === "removed" || asset.status === "pending") return this.json({}, 404);
      return await PublishHelper.editablePayload(this.repos, asset);
    });
  }

  @httpPost("/:id/download")
  public async download(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const asset = await this.repos.asset.loadPublished(String(req.params.id));
      if (!asset) return this.json({}, 404);
      const downloadCount = await recordAssetDownload(this.repos.asset, asset, req);
      const files = await this.repos.assetFile.loadLive(asset.id || "");
      const content = files.find((f) => fileRole(f.name || "") === "content");
      if (!content) return { downloadCount };
      return { url: ContentLibraryHelper.publicUrl(ContentLibraryHelper.liveKey(asset, content.name || "")), downloadCount };
    });
  }

  @httpPost("/:id/files/:name/download")
  public async downloadFile(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const asset = await this.repos.asset.loadPublished(String(req.params.id));
      if (!asset) return this.json({}, 404);
      const file = await this.repos.assetFile.loadOne(asset.id || "", String(req.params.name), null);
      if (!file) return this.json({}, 404);
      const downloadCount = await recordAssetDownload(this.repos.asset, asset, req);
      return { url: ContentLibraryHelper.publicUrl(ContentLibraryHelper.liveKey(asset, file.name || "")), downloadCount };
    });
  }

  // authz-exempt: ratings are keyed by au.id, so a signed-in user can only write their own row
  @httpPut("/:id/rating")
  public async rate(req: express.Request<{ id: string }, {}, { stars?: number | null }>, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      const asset = await this.repos.asset.loadPublished(String(req.params.id));
      if (!asset) return this.json({}, 404);
      if (asset.publisherUserId === au.id) return this.json({ errors: ["You cannot rate your own asset"] }, 409);
      const stars = req.body.stars == null ? null : Number(req.body.stars);
      if (stars !== null && (!Number.isInteger(stars) || stars < 1 || stars > 5)) return this.json({ errors: ["stars must be 1-5 or null"] }, 400);
      await this.repos.rating.setStars(asset.id || "", au.id, stars);
      const fresh = await this.repos.asset.loadById(asset.id || "");
      return { ratingAverage: this.average(fresh), ratingCount: fresh?.ratingCount || 0, myRating: stars };
    });
  }

  // authz-exempt: saves are keyed by au.id, so a signed-in user can only write their own row
  @httpPut("/:id/saved")
  public async save(req: express.Request<{ id: string }, {}, { saved?: boolean }>, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      const asset = await this.repos.asset.loadPublished(String(req.params.id));
      if (!asset) return this.json({}, 404);
      const saved = !!req.body.saved;
      await this.repos.rating.setSaved(asset.id || "", au.id, saved);
      return { saved };
    });
  }

  // authz-exempt: publisher ownership check lives in ownVisibility()
  @httpPost("/:id/unpublish")
  public async unpublish(req: express.Request, res: express.Response): Promise<any> {
    return this.ownVisibility(req, res, "published", "unpublished");
  }

  // authz-exempt: publisher ownership check lives in ownVisibility()
  @httpPost("/:id/republish")
  public async republish(req: express.Request, res: express.Response): Promise<any> {
    return this.ownVisibility(req, res, "unpublished", "published");
  }

  // authz-exempt: publisher ownership check lives inside
  private ownVisibility(req: express.Request, res: express.Response, from: string, to: string) {
    return this.actionWrapperAuth(req, res, async (au) => {
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset || asset.publisherUserId !== au.id) return this.json({}, 404);
      if (asset.status !== from) return this.json({ errors: [`asset is ${asset.status}`] }, 400);
      await this.repos.asset.update(asset.id || "", { status: to, unpublishedAt: to === "unpublished" ? new Date() : null as any, removedReason: to === "unpublished" ? "publisher" : null as any });
      return { status: to };
    });
  }

  private average(asset?: Asset): number | null {
    if (!asset || (asset.ratingCount || 0) < MIN_RATINGS_SHOWN) return null;
    return Math.round(((asset.ratingSum || 0) / (asset.ratingCount || 1)) * 10) / 10;
  }

  private async publicViews(assets: Asset[]): Promise<(Asset & { fileUrls: Record<string, string>; files: AssetFile[]; ratingAverage: number | null; publisherName?: string; version?: number; hasPendingSubmission?: boolean; detail?: any; myRating?: number | null; mySaved?: boolean })[]> {
    const files = await this.repos.assetFile.loadLiveMany(assets.map((a) => a.id || ""));
    const names = await userNames(assets.map((a) => a.publisherUserId));
    return assets.map((a) => {
      const { ratingSum: _sum, ...rest } = a;
      const live = files[a.id || ""] || [];
      return { ...rest, publisherName: names[a.publisherUserId || ""], files: live.map((f) => ({ ...f, role: fileRole(f.name || "") })), fileUrls: ContentLibraryHelper.fileUrls(a, live), ratingAverage: this.average(a) };
    });
  }
}
