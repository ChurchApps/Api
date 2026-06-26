import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { PlanTemplate } from "../models/index.js";
import { PlanTemplateHelper } from "../helpers/PlanTemplateHelper.js";
import { PlanAuth } from "../../../shared/helpers/index.js";

@controller("/doing/plantemplates")
export class PlanTemplateController extends DoingBaseController {
  @httpGet("/ministry/:ministryId")
  public async getForMinistry(@requestParam("ministryId") ministryId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!await PlanAuth.canEditMinistry(au, ministryId)) return this.json({}, 401);
      return await this.repos.planTemplate.loadByMinistryId(au.churchId, ministryId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const template: any = await this.repos.planTemplate.load(au.churchId, id);
      if (!template) return this.json({}, 404);
      if (!await PlanAuth.canEditMinistry(au, template.ministryId)) return this.json({}, 401);
      return template;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PlanTemplate[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      for (const item of req.body) {
        if (!await PlanAuth.canEditMinistry(au, item.ministryId)) return this.json({}, 401);
      }
      const promises = req.body.map((item) => { item.churchId = au.churchId; return this.repos.planTemplate.save(item); });
      return await Promise.all(promises);
    });
  }

  @httpPost("/fromPlan/:planId")
  public async fromPlan(@requestParam("planId") planId: string, req: express.Request<{}, {}, { id?: string; name?: string; ministryId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!await PlanAuth.canEditPlan(au, planId)) return this.json({}, 401);
      const template: PlanTemplate = { id: req.body.id, churchId: au.churchId, ministryId: req.body.ministryId, name: req.body.name };
      // Overwrite path: refresh an existing template's snapshot, keeping its name/ministry.
      if (req.body.id) {
        const existing: any = await this.repos.planTemplate.load(au.churchId, req.body.id);
        if (!existing) return this.json({}, 404);
        if (!await PlanAuth.canEditMinistry(au, existing.ministryId)) return this.json({}, 401);
        template.ministryId = template.ministryId || existing.ministryId;
        template.name = template.name || existing.name;
      }
      const data = await PlanTemplateHelper.captureFromPlan(this.repos, au.churchId, planId);
      template.data = JSON.stringify(data);
      return await this.repos.planTemplate.save(template);
    });
  }

  @httpPost("/apply/:id")
  public async apply(@requestParam("id") id: string, req: express.Request<{}, {}, { planIds: string[]; serviceOrder?: boolean; positions?: boolean }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const template: any = await this.repos.planTemplate.load(au.churchId, id);
      if (!template) return this.json({}, 404);
      const planIds = req.body.planIds || [];
      for (const planId of planIds) {
        if (!await PlanAuth.canEditPlan(au, planId)) return this.json({}, 401);
      }
      const data = JSON.parse(template.data || "{}");
      const opts = { serviceOrder: req.body.serviceOrder !== false, positions: req.body.positions === true };
      for (const planId of planIds) {
        await PlanTemplateHelper.applyToPlan(this.repos, au.churchId, planId, data, opts);
      }
      return { applied: planIds.length };
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const template: any = await this.repos.planTemplate.load(au.churchId, id);
      if (!template) return this.json({}, 404);
      if (!await PlanAuth.canEditMinistry(au, template.ministryId)) return this.json({}, 401);
      await this.repos.planTemplate.delete(au.churchId, id);
      return {};
    });
  }
}
