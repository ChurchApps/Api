import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController";
import { PlanItem } from "../models";

@controller("/doing/planItems")
export class PlanItemController extends DoingBaseController {
  @httpGet("/ids")
  public async getByIds(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const idsString = typeof req.query.ids === "string" ? req.query.ids : req.query.ids ? String(req.query.ids) : "";
      if (!idsString) return this.json({ error: "Missing required parameter: ids" });
      const ids = idsString.split(",");
      return await this.repos.planItem.loadByIds(au.churchId, ids);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.planItem.load(au.churchId, id);
    });
  }

  @httpGet("/presenter/:churchId/:planId")
  public async getForPresenter(@requestParam("churchId") churchId: string, @requestParam("planId") planId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const result = (await this.repos.planItem.loadForPlan(churchId, planId)) as PlanItem[];
      return this.buildTree(result, null as any);
    });
  }

  @httpGet("/plan/:planId")
  public async getByPlan(@requestParam("planId") planId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result = (await this.repos.planItem.loadForPlan(au.churchId, planId)) as PlanItem[];
      return this.buildTree(result, null as any);
    });
  }

  @httpPost("/sort")
  public async sort(req: express.Request<{}, {}, PlanItem>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.planItem.save(req.body);

      const items = (await this.repos.planItem.loadForPlan(au.churchId, req.body.planId || "")) as PlanItem[];
      const filtered = items.filter((i: PlanItem) => i.parentId === req.body.parentId || "");
      filtered.sort((a: PlanItem, b: PlanItem) => (a.sort || 0) - (b.sort || 0));
      for (let i = 0; i < filtered.length; i++) {
        filtered[i].sort = i + 1;
        await this.repos.planItem.save(filtered[i]);
      }
      return [];
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, PlanItem[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const promises: Promise<PlanItem>[] = [];
      req.body.forEach((planItem) => {
        planItem.churchId = au.churchId;
        promises.push(this.repos.planItem.save(planItem));
      });
      const result = await Promise.all(promises);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.planItem.delete(au.churchId, id);
      return {};
    });
  }

  private buildTree(planItems: PlanItem[], parentId: string | null): PlanItem[] {
    const result: PlanItem[] = [];
    planItems.forEach((pi) => {
      if (pi.parentId === parentId) {
        pi.children = this.buildTree(planItems, pi.id || "");
        result.push(pi);
      }
    });
    return result;
  }
}
