import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Workflow } from "../models/index.js";

@controller("/doing/workflows")
export class WorkflowController extends DoingBaseController {
  @httpGet("/:id/report")
  public async getReport(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
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
      return await this.repos.workflow.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.workflow.loadAll(au.churchId);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Workflow[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
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
      await this.repos.workflow.delete(au.churchId, id);
      return {};
    });
  }
}
