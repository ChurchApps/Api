import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { BatchUndoHelper } from "../../../shared/infrastructure/index.js";
import { Batch } from "../models/index.js";

const UNDO_WINDOW_DAYS = 30;

@controller("/membership/batches")
export class BatchController extends MembershipBaseController {

  @httpPost("/")
  public async create(req: express.Request<{}, {}, { label?: string; source?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const batch: Batch = {
        churchId: au.churchId,
        userId: au.id,
        label: req.body?.label,
        source: req.body?.source,
        status: "open"
      };
      return this.repos.batch.create(batch);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      return this.repos.batch.loadAll(au.churchId);
    });
  }

  @httpGet("/:id/results")
  public async getResults(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const batch = await this.repos.batch.load(au.churchId, id);
      if (!batch) return this.json({}, 404);
      if (batch.userId !== au.id && !au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const rows = await this.repos.auditLog.loadForBatch(au.churchId, id);
      return { batch, rows };
    });
  }

  @httpPost("/:id/complete")
  public async complete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const batch = await this.repos.batch.load(au.churchId, id);
      if (!batch) return this.json({}, 404);
      if (batch.userId !== au.id && !au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      if (batch.status !== "open") return this.json({ error: "Batch is not open" }, 400);
      const rows = await this.repos.auditLog.loadForBatch(au.churchId, id);
      await this.repos.batch.complete(au.churchId, id, rows.length);
      return this.repos.batch.load(au.churchId, id);
    });
  }

  @httpPost("/:id/undo")
  public async undo(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const batch = await this.repos.batch.load(au.churchId, id);
      if (!batch) return this.json({}, 404);
      if (batch.userId !== au.id && !au.checkAccess(Permissions.settings.edit)) return this.json({ error: "Not permitted" }, 401);
      if (batch.status !== "completed") return this.json({ error: "Batch is not completed" }, 400);

      const created = batch.created ? new Date(batch.created) : new Date(0);
      const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > UNDO_WINDOW_DAYS) return this.json({ error: "Undo window has expired" }, 400);

      const result = await BatchUndoHelper.undo(this.repos, au.churchId, batch, au.id);
      await this.repos.batch.setStatus(au.churchId, id, result.status, true);
      return result;
    });
  }
}
