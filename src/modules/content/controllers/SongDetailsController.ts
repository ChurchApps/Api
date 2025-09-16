import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController";
import { SongDetail } from "../models";
import { PraiseChartsHelper } from "../helpers/PraiseChartsHelper";
import { MusicBrainzHelper } from "../helpers/MusicBrainzHelper";

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
      return await this.repos.songDetail.loadForChurch(au.churchId);
    });
  }

  @httpPost("/create")
  public async post(req: express.Request<{}, {}, SongDetail>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const sd = req.body;
      if (!sd.praiseChartsId) return null;
      const existing = await this.repos.songDetail.loadByPraiseChartsId(sd.praiseChartsId);
      if (existing) return existing;
      else {
        const { songDetails, links } = await PraiseChartsHelper.load(sd.praiseChartsId);
        await MusicBrainzHelper.appendDetails(songDetails, links);

        const result = await this.repos.songDetail.save(songDetails);
        links.forEach(async (link) => {
          link.songDetailId = result.id;
          await this.repos.songDetailLink.save(link);
        });
        return result;
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, SongDetail[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const promises: Promise<SongDetail>[] = [];
      req.body.forEach((sd) => {
        promises.push(this.repos.songDetail.save(sd));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }
}
