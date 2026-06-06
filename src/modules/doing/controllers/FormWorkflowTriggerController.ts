import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { FormWorkflowTrigger } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/formWorkflowTriggers")
export class FormWorkflowTriggerController extends DoingBaseController {
  @httpGet("/workflow/:workflowId")
  public async getForWorkflow(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.formWorkflowTrigger.loadForWorkflow(au.churchId, workflowId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, FormWorkflowTrigger[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const promises: Promise<FormWorkflowTrigger>[] = [];
      req.body.forEach((trigger) => {
        trigger.churchId = au.churchId;
        promises.push(this.repos.formWorkflowTrigger.save(trigger));
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      await this.repos.formWorkflowTrigger.delete(au.churchId, id);
      return {};
    });
  }
}
