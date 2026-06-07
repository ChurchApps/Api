import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { WorkflowTrigger } from "../models/index.js";
import { EventTriggerHelper } from "../helpers/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/workflowTriggers")
export class WorkflowTriggerController extends DoingBaseController {
  // Static catalog of triggerable events + their condition fields for the B1Admin builder.
  @httpGet("/fields")
  public async getFields(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return EventTriggerHelper.fieldDefs();
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.workflowTrigger.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, WorkflowTrigger[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const promises: Promise<WorkflowTrigger>[] = [];
      req.body.forEach((trigger) => {
        trigger.churchId = au.churchId;
        promises.push(this.repos.workflowTrigger.save(trigger));
      });
      const result = await Promise.all(promises);
      EventTriggerHelper.invalidate(au.churchId);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      await this.repos.workflowTrigger.delete(au.churchId, id);
      EventTriggerHelper.invalidate(au.churchId);
      return {};
    });
  }
}
