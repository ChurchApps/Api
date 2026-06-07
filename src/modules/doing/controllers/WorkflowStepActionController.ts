import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { WorkflowStepAction } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/workflowStepActions")
export class WorkflowStepActionController extends DoingBaseController {
  @httpGet("/step/:stepId")
  public async getForStep(@requestParam("stepId") stepId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.workflowStepAction.loadForStep(au.churchId, stepId);
    });
  }

  @httpGet("/workflow/:workflowId")
  public async getForWorkflow(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.workflowStepAction.loadForWorkflow(au.churchId, workflowId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, WorkflowStepAction[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const promises: Promise<WorkflowStepAction>[] = [];
      req.body.forEach((action) => {
        action.churchId = au.churchId;
        promises.push(this.repos.workflowStepAction.save(action));
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      await this.repos.workflowStepAction.delete(au.churchId, id);
      return {};
    });
  }
}
