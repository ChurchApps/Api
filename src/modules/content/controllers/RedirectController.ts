import express from "express";
import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import { Permissions } from "../helpers/index.js";
import { Redirect } from "../models/index.js";
import { RedirectRepo } from "../repositories/RedirectRepo.js";
import { ContentBaseController } from "./ContentBaseController.js";

const MAX_REDIRECTS = 200;

@controller("/content/redirects")
export class RedirectController extends ContentBaseController {
  @httpGet("/public/:churchId")
  public async loadPublic(@requestParam("churchId") churchId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const path = req.query.path ? RedirectRepo.normalizePath(req.query.path.toString()) : undefined;
      return path ? await this.repos.redirect.loadByFromPath(churchId, path) : await this.repos.redirect.loadAll(churchId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.redirect.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.redirect.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Redirect[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);

      const redirects = req.body.map((r) => ({ ...r, churchId: au.churchId, fromPath: RedirectRepo.normalizePath(r.fromPath), toPath: (r.toPath || "").trim() }));

      for (const r of redirects) {
        if (!r.fromPath || !r.toPath) return this.json({ error: "fromPath and toPath are required" }, 400);
        if (r.fromPath.toLowerCase() === r.toPath.toLowerCase()) return this.json({ error: "fromPath and toPath cannot be the same" }, 400);
      }

      const creates = redirects.filter((r) => !r.id).length;
      if (creates > 0) {
        const existing = await this.repos.redirect.count(au.churchId);
        if (existing + creates > MAX_REDIRECTS) return this.json({ error: "Redirect limit (" + MAX_REDIRECTS + ") exceeded" }, 400);
      }

      return await Promise.all(redirects.map((r) => this.repos.redirect.save(r)));
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.redirect.delete(au.churchId, id);
      return this.json({});
    });
  }
}
