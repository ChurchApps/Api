import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Playlist } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/playlists")
export class ScreenPlaylistController extends DoingBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.playlist.load(au.churchId, id);
      return this.repos.playlist.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const data = await this.repos.playlist.loadAll(au.churchId);
      return this.repos.playlist.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Playlist[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      const promises: Promise<Playlist>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.playlist.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.playlist.convertAllToModel(au.churchId, result);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.plans.edit)) return this.json({}, 401);
      await this.repos.playlist.delete(au.churchId, id);
      return {};
    });
  }
}
