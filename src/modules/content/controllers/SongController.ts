import { controller, httpDelete, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { Song } from "../models/index.js";
import { ContentBaseController } from "./ContentBaseController.js";
import { Permissions } from "../helpers/index.js";
import { FreeShowSong, SongHelper } from "../helpers/SongHelper.js";

@controller("/content/songs")
export class SongController extends ContentBaseController {
  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const query = req.query.q as string;
      const results = await this.repos.song.search(au.churchId, query);
      return results;
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.song.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        return await this.repos.song.loadAll(au.churchId);
      }
    });
  }

  /*
    @httpPost("/create")
    public async create(req: express.Request<{}, {}, Song>, res: express.Response): Promise<any> {
      return this.actionWrapper(req, res, async (au) => {
        const song = req.body;
        song.churchId = au.churchId;
        if (!song.songDetailId) return null;
        const existing = await this.repos.song.loadBySongDetailId(au.churchId, song.songDetailId);
        if (existing) return existing;
        else return await this.repos.song.save(song);
      })
    }*/

  @httpPost("/")
  public async post(req: express.Request<{}, {}, Song[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Song>[] = [];
        req.body.forEach((song) => {
          song.churchId = au.churchId;
          promises.push(this.repos.song.save(song));
        });
        const result = await Promise.all(promises);
        return result;
      }
    });
  }

  // We should do batches of 10 or so.
  @httpPost("/import")
  public async import(req: express.Request<{}, {}, FreeShowSong[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401); //This is via oAuth.  Need to figure out another way.

      const songs = req.body;
      if (!Array.isArray(songs)) {
        return this.json({ error: "Request body must be an array of songs" }, 400);
      }

      const arrangements = await SongHelper.importSongs(au.churchId, songs);
      return arrangements;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      await this.repos.song.delete(au.churchId, id);
      return null;
    });
  }
}
