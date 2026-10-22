import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { WorkflowStepAction } from "../models/index.js";
import { AssignmentWorkflowHelper } from "../helpers/AssignmentWorkflowHelper.js";
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
      for (const action of req.body) {
        const step = await this.repos.workflowStep.load(au.churchId, action.stepId);
        if (!step) return this.json({}, 404);
        const workflow = await this.repos.workflow.load(au.churchId, step.workflowId);
        if (action.actionType === "sendAssignmentRequest" && workflow?.workflowType !== AssignmentWorkflowHelper.workflowType) return this.json({ message: "Serving messages require an assignment confirmation workflow" }, 400);
        if (workflow?.workflowType === AssignmentWorkflowHelper.workflowType && ["sendEmail", "sendText", "addToWorkflow"].includes(action.actionType)) return this.json({ message: "Use serving request messages to keep delivery tied to the assignment" }, 400);
        let config: any;
        try { config = JSON.parse(action.config || "{}"); } catch { return this.json({ message: "Invalid action configuration" }, 400); }
        if (action.actionType === "sendAssignmentRequest" && !["email", "sms"].includes(config.channel)) return this.json({ message: "Choose email or sms" }, 400);
        if (action.actionType === "sendAssignmentRequest" && config.channel === "sms" && !au.checkAccess(Permissions.texting.send)) return this.json({}, 401);
      }
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
