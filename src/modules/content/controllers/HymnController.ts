import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { Hymn } from "../models/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { Permissions } from "../helpers/index.js";

@controller("/content/hymns")
export class HymnController extends ContentBaseController {
  @httpGet("/public/:churchId/:id")
  public async getPublic(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const hymn = await this.repos.hymn.loadPublic(churchId, id);
      return hymn || this.json({}, 404);
    });
  }

  @httpGet("/public/:churchId")
  public async loadPublicAll(@requestParam("churchId") churchId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => this.repos.hymn.loadPublicAll(churchId));
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return this.repos.hymn.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async loadAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return this.repos.hymn.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Hymn[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const promises = req.body.map((hymn) => this.repos.hymn.save({ ...hymn, churchId: au.churchId }));
      return await Promise.all(promises);
    });
  }

  @httpPost("/:id/publish")
  public async publish(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.hymn.setPublished(au.churchId, id, true);
      return this.repos.hymn.load(au.churchId, id);
    });
  }

  @httpPost("/:id/unpublish")
  public async unpublish(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.hymn.setPublished(au.churchId, id, false);
      return this.repos.hymn.load(au.churchId, id);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.hymn.delete(au.churchId, id);
      return this.json({});
    });
  }
}
