import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { Arrangement, ArrangementKey, Song, SongDetail } from "../models/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { Permissions } from "../helpers/index.js";

@controller("/content/arrangementKeys")
export class ArrangementKeyController extends ContentBaseController {
  @httpGet("/presenter/:churchId/:id")
  public async getForPresenter(@requestParam("churchId") churchId: string, @requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const arrangementKey: ArrangementKey = await this.repos.arrangementKey.load(churchId, id);
      const arrangement: Arrangement = await this.repos.arrangement.load(churchId, arrangementKey.arrangementId);
      if (!arrangement.freeShowId) {
        arrangement.freeShowId = `chumssong_${arrangementKey.id}`;
        await this.repos.arrangement.save(arrangement);
      }

      const song: Song = await this.repos.song.load(churchId, arrangement.songId);
      const songDetail: SongDetail = await this.repos.songDetail.loadGlobal(arrangement.songDetailId);
      const result = { arrangementKey, arrangement, song, songDetail };
      return result;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.arrangementKey.load(au.churchId, id);
    });
  }

  @httpGet("/arrangement/:arrangementId")
  public async getBySong(@requestParam("arrangementId") arrangementId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        return await this.repos.arrangementKey.loadByArrangementId(au.churchId, arrangementId);
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        return await this.repos.arrangementKey.loadAll(au.churchId);
      }
    });
  }

  @httpPost("/")
  public async post(req: express.Request<{}, {}, ArrangementKey[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const promises: Promise<ArrangementKey>[] = [];
        req.body.forEach((arrangementKey) => {
          arrangementKey.churchId = au.churchId;
          promises.push(this.repos.arrangementKey.save(arrangementKey));
        });
        const result = await Promise.all(promises);
        return result;
      }
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        await this.repos.arrangementKey.delete(au.churchId, id);
        return this.json({});
      }
    });
  }
}
