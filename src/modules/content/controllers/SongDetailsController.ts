import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { SongDetail } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { PraiseChartsHelper } from "../helpers/PraiseChartsHelper.js";
import { MusicBrainzHelper } from "../helpers/MusicBrainzHelper.js";

@controller("/content/songDetails")
export class SongDetailsController extends ContentBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      return await this.repos.songDetail.loadGlobal(id);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset.toString(), 10) : undefined;
      const search = req.query.search ? req.query.search.toString() : undefined;

      if (limit !== undefined || offset !== undefined || search !== undefined) {
        const [songDetails, count] = await Promise.all([
          this.repos.songDetail.loadForChurch(au.churchId, limit, offset, search),
          this.repos.songDetail.loadCountForChurch(au.churchId, search)
        ]);
        console.log(limit, offset, search);
        console.log({ songDetails, count });
        return { songDetails, count };
      } else {
        return await this.repos.songDetail.loadForChurch(au.churchId);
      }
    });
  }

  @httpPost("/create")
  public async post(req: express.Request<{}, {}, SongDetail>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const sd = req.body;
      if (!sd.praiseChartsId) return null;
      const existing = await this.repos.songDetail.loadByPraiseChartsId(sd.praiseChartsId);
      if (existing) return existing;
      try {
        const { songDetails, links } = await PraiseChartsHelper.load(sd.praiseChartsId);
        await MusicBrainzHelper.appendDetails(songDetails, links);
        const result = await this.repos.songDetail.save(songDetails);
        links.forEach(async (link) => {
          link.songDetailId = result.id;
          await this.repos.songDetailLink.save(link);
        });
        return result;
      } catch {
        return await this.repos.songDetail.save(sd);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, SongDetail[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const promises: Promise<SongDetail>[] = [];
      req.body.forEach((sd) => {
        promises.push(this.repos.songDetail.save(sd));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }
}
