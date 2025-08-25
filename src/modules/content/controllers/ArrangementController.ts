import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { Arrangement } from "../models";
import { ContentBaseController } from "./ContentBaseController";
import { Permissions } from "../helpers";

@controller("/content/arrangements")
export class ArrangementController extends ContentBaseController {
  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repositories.arrangement.load(au.churchId, id);
    });
  }

  @httpGet("/song/:songId")
  public async getBySong(@requestParam("songId") songId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        return await this.repositories.arrangement.loadBySongId(au.churchId, songId);
      }
    });
  }

  @httpGet("/songDetail/:songDetailId")
  public async getBySongDetail(@requestParam("songDetailId") songDetailId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        return await this.repositories.arrangement.loadBySongDetailId(au.churchId, songDetailId);
      }
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        return await this.repositories.arrangement.loadAll(au.churchId);
      }
    });
  }

  @httpPost("/")
  public async post(req: express.Request<{}, {}, Arrangement[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      else {
        const promises: Promise<Arrangement>[] = [];
        req.body.forEach((arrangement) => {
          arrangement.churchId = au.churchId;
          promises.push(this.repositories.arrangement.save(arrangement));
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
        const existing = await this.repositories.arrangement.load(au.churchId, id);
        if (existing) {
          await this.repositories.arrangement.delete(au.churchId, id);
          await this.repositories.arrangementKey.deleteForArrangement(au.churchId, id);
          const songArrangments = await this.repositories.arrangement.loadBySongId(au.churchId, existing.songId);
          if (songArrangments.length === 0) await this.repositories.song.delete(au.churchId, existing.songId);
        }
        return this.json({});
      }
    });
  }

  @httpPost("/freeShow/missing")
  public async getMissingFreeShowArrangements(req: express.Request<{}, {}, { freeShowIds: string[] }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { freeShowIds } = req.body;
      if (!freeShowIds || !Array.isArray(freeShowIds)) {
        return this.json({ error: "Invalid request body. Expected array of freeShowIds" }, 400);
      }

      const existingArrangements = await this.repositories.arrangement.loadAll(au.churchId);
      const existingFreeShowIds = existingArrangements.map((a: Arrangement) => a.freeShowId).filter((id: string | undefined) => id);

      // Return array of IDs that don't exist in Chums
      const missingIds = freeShowIds.filter((id) => !existingFreeShowIds.includes(id));

      return this.json(missingIds);
    });
  }
}
