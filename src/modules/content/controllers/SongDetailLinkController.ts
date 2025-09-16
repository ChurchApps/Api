import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController";
import { SongDetailLink } from "../models";
import { MusicBrainzHelper } from "../helpers/MusicBrainzHelper";

@controller("/content/songDetailLinks")
export class SongDetailLinkController extends ContentBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      return await this.repos.songDetailLink.load(id);
    });
  }

  @httpGet("/songDetail/:songDetailId")
  public async getForSongDetail(@requestParam("songDetailId") songDetailId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      return await this.repos.songDetailLink.loadForSongDetail(songDetailId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, SongDetailLink[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      const promises: Promise<SongDetailLink>[] = [];
      req.body.forEach((sd) => {
        promises.push(this.repos.songDetailLink.save(sd));
      });
      const result = await Promise.all(promises);

      if (result[0].service === "MusicBrainz") {
        const sd = await this.repos.songDetail.loadGlobal(result[0].songDetailId);
        if (sd) {
          await MusicBrainzHelper.appendDetailsById(sd, result[0].serviceKey);
          await this.repos.songDetail.save(sd);
        }
      }

      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async () => {
      await this.repos.songDetailLink.delete(id);
      return null;
    });
  }
}
