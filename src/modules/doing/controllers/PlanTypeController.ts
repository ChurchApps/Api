import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Plan, PlanItem, PlanType } from "../models/index.js";
import { LessonTrimHelper } from "../helpers/LessonTrimHelper.js";
import { PlanAuth } from "../../../shared/helpers/index.js";

@controller("/doing/planTypes")
export class PlanTypeController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repos.planType.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/ministryId/:ministryId")
  public async getByMinistryId(@requestParam("ministryId") ministryId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.planType.loadByMinistryId(au.churchId, ministryId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.planType.load(au.churchId, id);
      return this.repos.planType.convertToModel(au.churchId, data);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const data = await this.repos.planType.loadAll(au.churchId);
      return this.repos.planType.convertAllToModel(au.churchId, data);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PlanType[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      for (const item of req.body) {
        let ministryId = item.ministryId;
        if (!ministryId && item.id) {
          const existing: any = await this.repos.planType.load(au.churchId, item.id);
          ministryId = existing?.ministryId;
        }
        if (!await PlanAuth.canEditMinistry(au, ministryId)) return this.json({}, 401);
      }
      const promises: Promise<PlanType>[] = [];
      req.body.forEach((item) => { item.churchId = au.churchId; promises.push(this.repos.planType.save(item)); });
      const result = await Promise.all(promises);
      return this.repos.planType.convertAllToModel(au.churchId, result);
    });
  }

  // Save the parts kept in one customized plan as this plan type's lesson trim (#1401). preview returns what would be
  // saved and the upcoming lessons it would trim; applyUpcoming re-trims those lessons, replacing their order of service.
  @httpPost("/:id/lessonTrim")
  public async saveLessonTrim(@requestParam("id") id: string, req: express.Request<{}, {}, { fromPlanId?: string; applyUpcoming?: boolean; preview?: boolean }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!await PlanAuth.canEditPlanType(au, id)) return this.json({}, 401);
      const { fromPlanId, applyUpcoming, preview } = req.body || {};
      const plan = fromPlanId ? (await this.repos.plan.load(au.churchId, fromPlanId)) as Plan : null;
      if (!plan || plan.planTypeId !== id || !plan.providerId || !plan.providerPlanId) return this.json({ error: "The plan must be a lesson in this plan type" }, 400);

      const rows = (await this.repos.planItem.loadForPlan(au.churchId, plan.id!)) as PlanItem[];
      let instructions = null;
      try { instructions = await LessonTrimHelper.loadInstructions(this.repos, au.churchId, plan); } catch { instructions = null; }
      const trim = LessonTrimHelper.capture(rows, plan, instructions);
      if (trim.keep.length === 0) return this.json({ error: "Nothing from the lesson is in this plan's order of service" }, 400);

      const today = new Date().toISOString().split("T")[0];
      const upcoming = ((await this.repos.plan.loadByPlanTypeId(au.churchId, id)) as Plan[])
        .filter((p) => p.id !== plan.id && p.providerId === plan.providerId && p.providerPlanId && new Date(p.serviceDate!).toISOString().split("T")[0] >= today)
        .reverse();
      if (preview) return { keep: trim.keep, upcoming: upcoming.map((p) => ({ planId: p.id, name: p.name, serviceDate: p.serviceDate })) };

      await this.repos.planType.updateLessonTrim(au.churchId, id, JSON.stringify(trim));
      const applied = [];
      if (applyUpcoming) {
        for (const p of upcoming) {
          const result = await LessonTrimHelper.apply(this.repos, au.churchId, p, { force: true });
          if (result) applied.push(result);
        }
      }
      return { keep: trim.keep, applied };
    });
  }

  @httpDelete("/:id/lessonTrim")
  public async clearLessonTrim(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!await PlanAuth.canEditPlanType(au, id)) return this.json({}, 401);
      await this.repos.planType.updateLessonTrim(au.churchId, id, null);
      return {};
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!await PlanAuth.canEditPlanType(au, id)) return this.json({}, 401);
      await this.repos.planType.delete(au.churchId, id);
      return {};
    });
  }
}
