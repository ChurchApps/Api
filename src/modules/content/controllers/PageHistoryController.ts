import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { ContentBaseController } from "./ContentBaseController.js";
import { PageHistory } from "../models/index.js";
import { Permissions } from "../helpers/index.js";
import { TreeHelper } from "../helpers/TreeHelper.js";

@controller("/content/pageHistory")
export class PageHistoryController extends ContentBaseController {

  @httpGet("/page/:pageId")
  public async getForPage(@requestParam("pageId") pageId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return await this.repos.pageHistory.loadForPage(au.churchId, pageId);
    });
  }

  @httpGet("/block/:blockId")
  public async getForBlock(@requestParam("blockId") blockId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return await this.repos.pageHistory.loadForBlock(au.churchId, blockId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);
      return await this.repos.pageHistory.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PageHistory>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);

      const history = req.body;
      history.churchId = au.churchId;
      history.userId = au.id;
      history.createdDate = new Date();

      const result = await this.repos.pageHistory.save(history);

      // Occasionally clean up old history entries (keep last 30 days)
      // Only run cleanup ~5% of the time to reduce database load
      if (history.pageId && Math.random() < 0.05) {
        await this.repos.pageHistory.deleteOldHistory(au.churchId, history.pageId, 30);
      }

      return result;
    });
  }

  @httpPost("/restore/:id")
  public async restore(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);

      const history = await this.repos.pageHistory.load(au.churchId, id);
      if (!history) return this.json({ error: "History not found" }, 404);

      const snapshot = JSON.parse(history.snapshotJSON);

      // Delete existing sections and elements, then restore from snapshot
      await TreeHelper.deleteAndRestoreContent(au.churchId, history.pageId, history.blockId, snapshot);

      return { success: true, snapshot };
    });
  }

  @httpPost("/restoreSnapshot")
  public async restoreSnapshot(req: express.Request<{}, {}, { pageId?: string; blockId?: string; snapshot: any }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.content.edit)) return this.json({}, 401);

      const { pageId, blockId, snapshot } = req.body;
      if (!snapshot || !snapshot.sections) return this.json({ error: "Invalid snapshot" }, 400);

      // Delete existing sections and elements, then restore from snapshot
      await TreeHelper.deleteAndRestoreContent(au.churchId, pageId, blockId, snapshot);

      return { success: true };
    });
  }
}
