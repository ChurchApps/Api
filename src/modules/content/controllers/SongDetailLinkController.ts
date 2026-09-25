import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { SongDetailLink } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { MusicBrainzHelper } from "../helpers/MusicBrainzHelper.js";

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
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      const isServerAdmin = au.checkAccess(Permissions.server.admin);
      for (const link of req.body) {
        if (isServerAdmin) continue;
        if (link.id) {
          const existing = await this.repos.songDetailLink.load(link.id);
          if (!existing || existing.songDetailId !== link.songDetailId || !(await this.repos.songDetail.isExclusiveTo(au.churchId, existing.songDetailId))) return this.json({ error: "Shared song links cannot be edited" }, 403);
        }
        const url = SongDetailLinkController.serviceUrl(link.service, link.serviceKey);
        if (url) link.url = url;
        else if (!(await this.repos.songDetail.isExclusiveTo(au.churchId, link.songDetailId))) return this.json({ error: "Unsupported link service" }, 400);
      }
      const promises: Promise<SongDetailLink>[] = [];
      req.body.forEach((sd) => {
        promises.push(this.repos.songDetailLink.save(sd));
      });
      const result = await Promise.all(promises);

      if (result[0].service === "MusicBrainz" && (isServerAdmin || await this.repos.songDetail.isExclusiveTo(au.churchId, result[0].songDetailId))) {
        const sd = await this.repos.songDetail.loadGlobal(result[0].songDetailId);
        if (sd) {
          await MusicBrainzHelper.appendDetailsById(sd, result[0].serviceKey);
          await this.repos.songDetail.save(sd);
        }
      }

      return result;
    });
  }

  // Shared rows get their url rebuilt server-side so a church can't point everyone's link elsewhere.
  static serviceUrl(service: string, serviceKey: string): string {
    const key = (serviceKey || "").trim();
    if (!key || /\s/.test(key)) return "";
    switch (service) {
      case "Apple": return "https://music.apple.com/us/album/" + key;
      case "CCLI": return "https://songselect.ccli.com/Songs/" + key;
      case "Genius": return "https://genius.com/" + key;
      case "Hymnary": return "https://hymnary.org/text/" + key;
      case "MusicBrainz": return "https://musicbrainz.org/recording/" + key;
      case "Spotify": return "https://open.spotify.com/track/" + key;
      case "YouTube": return "https://www.youtube.com/watch?v=" + key;
      default: return "";
    }
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      if (!au.checkAccess(Permissions.server.admin)) {
        const existing = await this.repos.songDetailLink.load(id);
        if (!existing || !(await this.repos.songDetail.isExclusiveTo(au.churchId, existing.songDetailId))) return this.json({ error: "Shared song links cannot be deleted" }, 403);
      }
      await this.repos.songDetailLink.delete(id);
      return null;
    });
  }
}
