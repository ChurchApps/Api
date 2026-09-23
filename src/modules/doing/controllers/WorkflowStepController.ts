import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { WorkflowStep } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { WorkflowHelper } from "../helpers/index.js";

@controller("/doing/workflowSteps")
export class WorkflowStepController extends DoingBaseController {
  @httpGet("/workflow/:workflowId")
  public async getForWorkflow(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.workflowStep.loadForWorkflow(au.churchId, workflowId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.workflowStep.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, WorkflowStep[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const promises: Promise<WorkflowStep>[] = [];
      req.body.forEach((step) => {
        step.churchId = au.churchId;
        promises.push(this.repos.workflowStep.save(step));
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const step = (await this.repos.workflowStep.load(au.churchId, id)) as WorkflowStep;
      if (step?.workflowId) {
        const remaining = ((await this.repos.workflowStep.loadForWorkflow(au.churchId, step.workflowId)) as WorkflowStep[]).filter((s) => s.id !== id);
        const cards = ((await this.repos.task.loadByWorkflow(au.churchId, step.workflowId, "Open")) as any[]).filter((c) => c.stepId === id);
        for (const card of cards) {
          if (remaining[0]?.id) await WorkflowHelper.moveToStep(card, remaining[0].id, this.repos, true);
          else await this.repos.task.save({ ...card, status: "Closed", dateClosed: new Date() });
        }
        await this.repos.workflowStepAction.deleteForStep(au.churchId, id);
      }
      await this.repos.workflowStep.delete(au.churchId, id);
      return {};
    });
  }
}
