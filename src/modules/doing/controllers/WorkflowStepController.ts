import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { WorkflowStep } from "../models/index.js";

@controller("/doing/workflowSteps")
export class WorkflowStepController extends DoingBaseController {
  @httpGet("/workflow/:workflowId")
  public async getForWorkflow(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.workflowStep.loadForWorkflow(au.churchId, workflowId);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.workflowStep.load(au.churchId, id);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, WorkflowStep[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
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
      await this.repos.workflowStep.delete(au.churchId, id);
      return {};
    });
  }
}
