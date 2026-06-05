import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Workflow } from "../models/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { WorkflowHelper, WorkflowTemplates } from "../helpers/index.js";

@controller("/doing/workflows")
export class WorkflowController extends DoingBaseController {
  @httpGet("/templates")
  public async getTemplates(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      return WorkflowTemplates.all;
    });
  }

  @httpGet("/:id/report")
  public async getReport(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.view)) return this.json({}, 401);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [stepCounts, overdue, throughput] = await Promise.all([
        this.repos.task.countByStep(au.churchId, id),
        this.repos.task.loadOverdue(au.churchId, id),
        this.repos.task.throughput(au.churchId, id, since)
      ]);
      return { stepCounts, overdue, throughput };
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.view)) return this.json({}, 401);
      return await this.repos.workflow.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.view)) return this.json({}, 401);
      return await this.repos.workflow.loadAll(au.churchId);
    });
  }

  @httpPost("/fromTemplate")
  public async fromTemplate(req: express.Request<{}, {}, { templateKey: string; name?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      const template = WorkflowTemplates.get(req.body.templateKey);
      if (!template) return this.json({}, 404);
      return await WorkflowHelper.createFromTemplate(au.churchId, template, req.body.name, this.repos);
    });
  }

  @httpPost("/:id/duplicate")
  public async duplicate(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      const result = await WorkflowHelper.duplicateWorkflow(au.churchId, id, this.repos);
      if (!result) return this.json({}, 404);
      return result;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Workflow[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      const promises: Promise<Workflow>[] = [];
      req.body.forEach((workflow) => {
        workflow.churchId = au.churchId;
        promises.push(this.repos.workflow.save(workflow));
      });
      return await Promise.all(promises);
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.doing.admin)) return this.json({}, 401);
      await this.repos.workflow.delete(au.churchId, id);
      return {};
    });
  }
}
