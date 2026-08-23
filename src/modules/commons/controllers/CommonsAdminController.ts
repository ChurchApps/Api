import { controller, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { ContentLibraryHelper, QualityHelper } from "../helpers/index.js";
import { Repos } from "../repositories/index.js";

@controller("/commons/admin")
export class CommonsAdminController extends CommonsBaseController {
  // lets the SPA decide what to render without provoking a 401 on every load
  @httpGet("/status")
  public async status(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => ({ admin: !!au.id && au.checkAccess(Permissions.server.admin) }));
  }

  @httpGet("/songs")
  public async pendingSongs(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const apiBase = ContentLibraryHelper.requestApiBase(req);
      return await Promise.all((await this.repos.song.loadPending()).map((s) => ContentLibraryHelper.withReviewUrls(s, apiBase)));
    });
  }

  // signature-gated rather than JWT-gated: review players and <img> tags never send the Authorization header
  @httpGet("/pending-files/:id/:field")
  public async pendingFile(req: express.Request, res: express.Response): Promise<any> {
    const id = String(req.params.id);
    const field = String(req.params.field);
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig || "");
    if (!ContentLibraryHelper.verifyPendingFile(id, field, exp, sig)) {
      res.status(404).json({});
      return;
    }
    const repos = await this.getRepos<Repos>();
    const song = await repos.song.loadById(id);
    if (!song || song.status !== "pending") {
      res.status(404).json({});
      return;
    }
    const file = await ContentLibraryHelper.readPendingField(song, field);
    if (!file) {
      res.status(404).json({});
      return;
    }
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(file.buffer);
  }

  @httpGet("/reports")
  public async openReports(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      return await this.repos.report.loadOpen();
    });
  }

  @httpGet("/abc-submissions")
  public async abcSubmissions(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      return await this.repos.abcSubmission.loadPending();
    });
  }

  // authz-exempt: Server Admin gate lives in setAbcStatus
  @httpPost("/abc-submissions/:id/approve")
  public async approveAbc(req: express.Request, res: express.Response): Promise<any> {
    return this.setAbcStatus(req, res, "approved");
  }

  // authz-exempt: Server Admin gate lives in setAbcStatus
  @httpPost("/abc-submissions/:id/reject")
  public async rejectAbc(req: express.Request, res: express.Response): Promise<any> {
    return this.setAbcStatus(req, res, "rejected");
  }

  // authz-exempt: Server Admin gate lives in setSongStatus
  @httpPost("/songs/:id/approve")
  public async approve(req: express.Request, res: express.Response): Promise<any> {
    return this.setSongStatus(req, res, "approved");
  }

  // authz-exempt: Server Admin gate lives in setSongStatus
  @httpPost("/songs/:id/reject")
  public async reject(req: express.Request, res: express.Response): Promise<any> {
    return this.setSongStatus(req, res, "removed");
  }

  @httpPost("/score-missing")
  public async scoreMissing(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      // ponytail: 8 per call fits the 30s Lambda; caller loops until remaining is 0
      const songs = await this.repos.song.loadUnscored(8);
      let scored = 0;
      for (const s of songs) {
        const fields = await QualityHelper.score(s);
        if (fields.qualityScore != null) {
          await this.repos.song.update(s.id, fields);
          scored++;
        }
      }
      return { scored, remaining: (await this.repos.song.loadUnscored(1)).length };
    });
  }

  @httpPost("/reports/:id/resolve")
  public async resolve(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      await this.repos.report.updateStatus(String(req.params.id), "resolved");
      return { status: "resolved" };
    });
  }

  @httpGet("/assets/pending")
  public async pendingAssets(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      return await this.repos.asset.loadPending();
    });
  }

  @httpPost("/assets/:id/approve")
  public async approveAsset(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      const updates = await ContentLibraryHelper.publishAsset(asset);
      await this.repos.asset.update(asset.id, { ...updates, status: "approved", reviewedBy: au.id, reviewedAt: new Date() });
      return { status: "approved" };
    });
  }

  @httpPost("/assets/:id/reject")
  public async rejectAsset(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      await ContentLibraryHelper.removeAssetObjects(asset);
      await this.repos.asset.update(asset.id, { status: "removed", contentPath: null, thumbPath: null, reviewedBy: au.id, reviewedAt: new Date() } as any);
      return { status: "removed" };
    });
  }

  @httpPost("/assets/:id/feature")
  public async featureAsset(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const asset = await this.repos.asset.loadById(String(req.params.id));
      if (!asset) return this.json({}, 404);
      const featured = !asset.featured;
      await this.repos.asset.update(asset.id, { featured });
      return { featured };
    });
  }

  // status is bookkeeping only — an approved .abc is promoted by hand to the
  // song's folder in the WorshipCommonsContent repo
  private setAbcStatus(req: express.Request, res: express.Response, status: string) {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      await this.repos.abcSubmission.updateStatus(String(req.params.id), status);
      return { status };
    });
  }

  private setSongStatus(req: express.Request, res: express.Response, status: string) {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const song = await this.repos.song.loadById(String(req.params.id));
      if (!song) return this.json({}, 404);
      if (status === "approved") {
        const updates = await ContentLibraryHelper.publishSong({ ...song, status });
        await this.repos.song.update(song.id, { status, ...updates });
      } else {
        await ContentLibraryHelper.removeSongObjects(song);
        await this.repos.song.update(song.id, { status });
      }
      return { status };
    });
  }
}
