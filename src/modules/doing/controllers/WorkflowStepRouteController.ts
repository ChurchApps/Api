import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Condition, Conjunction, WorkflowStepRoute } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/workflowStepRoutes")
export class WorkflowStepRouteController extends DoingBaseController {
  @httpGet("/step/:stepId")
  public async getForStep(@requestParam("stepId") stepId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.view)) return this.json({}, 401);
      return await this.repos.workflowStepRoute.loadForStep(au.churchId, stepId);
    });
  }

  @httpGet("/workflow/:workflowId")
  public async getForWorkflow(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.view)) return this.json({}, 401);
      return await this.repos.workflowStepRoute.loadForWorkflow(au.churchId, workflowId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, WorkflowStepRoute[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      const result: WorkflowStepRoute[] = [];
      for (const route of req.body) {
        route.churchId = au.churchId;
        const saved = (await this.repos.workflowStepRoute.save(route)) as WorkflowStepRoute;
        // personMatch routes need a root conjunction to hang conditions off of.
        if (saved.kind === "personMatch") {
          const existing = (await this.repos.conjunction.loadForStepRoute(au.churchId, saved.id || "")) as Conjunction[];
          if (!existing || existing.length === 0) {
            await this.repos.conjunction.save({ churchId: au.churchId, stepRouteId: saved.id, parentId: null, groupType: "and" } as Conjunction);
          }
        }
        result.push(saved);
      }
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      // Tear down the route's condition tree before the route itself.
      const conditions = (await this.repos.condition.loadForStepRoute(au.churchId, id)) as Condition[];
      for (const c of conditions) if (c.id) await this.repos.condition.delete(au.churchId, c.id);
      const conjunctions = (await this.repos.conjunction.loadForStepRoute(au.churchId, id)) as Conjunction[];
      for (const cj of conjunctions) if (cj.id) await this.repos.conjunction.delete(au.churchId, cj.id);
      await this.repos.workflowStepRoute.delete(au.churchId, id);
      return {};
    });
  }
}
