import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { FileStorageHelper } from "@churchapps/apihelper";
import { DoingBaseController } from "./DoingBaseController.js";
import { Task } from "../models/index.js";
import { Environment, WorkflowHelper } from "../helpers/index.js";

@controller("/doing/tasks")
export class TaskController extends DoingBaseController {
  @httpGet("/timeline")
  public async getTimeline(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const taskIds = typeof req.query.taskIds === "string" ? req.query.taskIds.split(",") : req.query.taskIds ? [String(req.query.taskIds)] : [];
      return await this.repos.task.loadTimeline(au.churchId, au.personId, taskIds);
    });
  }

  @httpGet("/closed")
  public async getForPersonClosed(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.task.loadForPerson(au.churchId, au.personId, "Closed");
    });
  }

  @httpGet("/directoryUpdate/:personId")
  public async getPersonDirectoryUpdate(@requestParam("personId") personId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.task.loadForDirectoryUpdate(au.churchId, personId);
    });
  }

  // --- Workflow board / cards ---

  @httpGet("/board/:workflowId")
  public async getBoard(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const [workflow, steps, cards] = await Promise.all([
        this.repos.workflow.load(au.churchId, workflowId),
        this.repos.workflowStep.loadForWorkflow(au.churchId, workflowId),
        this.repos.task.loadByWorkflow(au.churchId, workflowId, "Open")
      ]);
      return { workflow, steps, cards };
    });
  }

  @httpGet("/cards/my")
  public async getMyCards(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.task.loadCardsForPerson(au.churchId, au.personId, "Open");
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.task.load(au.churchId, id);
    });
  }

  @httpGet("/")
  public async getForPerson(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.task.loadForPerson(au.churchId, au.personId, "Open");
    });
  }

  @httpPost("/loadForGroups")
  public async loadForGroups(req: express.Request<{}, {}, { groupIds: string[]; status: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      return await this.repos.task.loadForGroups(au.churchId, req.body.groupIds, req.body.status);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Task[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const result: Task[] = [];
      for (const task of req.body) {
        task.churchId = au.churchId;
        if (req.query?.type === "directoryUpdate") await this.handleDirectoryUpdate(au.churchId, task);
        result.push(await this.repos.task.save(task));
      }
      return result;
    });
  }

  @httpPost("/addToWorkflow")
  public async addToWorkflow(req: express.Request<{}, {}, { workflowId: string; stepId?: string; associatedWith: { type?: string; id?: string; label?: string } }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { workflowId, stepId, associatedWith } = req.body;
      return await WorkflowHelper.addToWorkflow(au.churchId, workflowId, associatedWith || {}, this.actor(au), undefined, this.repos, stepId);
    });
  }

  @httpPost("/bulkAddToWorkflow")
  public async bulkAddToWorkflow(req: express.Request<{}, {}, { workflowId: string; people?: { id: string; label?: string }[]; listId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { workflowId, people } = req.body;
      const targets = (people || []).map((p) => ({ type: "person", id: p.id, label: p.label }));
      return await WorkflowHelper.addPeopleToWorkflow(au.churchId, workflowId, targets, this.actor(au), undefined, this.repos);
    });
  }

  private actor(au: { personId?: string; firstName?: string; lastName?: string }) {
    return { type: "person", id: au.personId, label: au.firstName ? au.firstName + " " + au.lastName : "" };
  }

  @httpPost("/:id/moveStep")
  public async moveStep(@requestParam("id") id: string, req: express.Request<{}, {}, { stepId: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const task = (await this.repos.task.load(au.churchId, id)) as Task;
      if (!task) return this.json({}, 404);
      return await WorkflowHelper.moveToStep(task, req.body.stepId, this.repos);
    });
  }

  @httpPost("/:id/complete")
  public async complete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const task = (await this.repos.task.load(au.churchId, id)) as Task;
      if (!task) return this.json({}, 404);
      return await WorkflowHelper.complete(task, this.repos);
    });
  }

  @httpPost("/:id/reassign")
  public async reassign(@requestParam("id") id: string, req: express.Request<{}, {}, { assignedToType?: string; assignedToId?: string; assignedToLabel?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const task = (await this.repos.task.load(au.churchId, id)) as Task;
      if (!task) return this.json({}, 404);
      return await WorkflowHelper.reassign(task, { type: req.body.assignedToType, id: req.body.assignedToId, label: req.body.assignedToLabel }, this.repos);
    });
  }

  @httpPost("/:id/snooze")
  public async snooze(@requestParam("id") id: string, req: express.Request<{}, {}, { days: number }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const task = (await this.repos.task.load(au.churchId, id)) as Task;
      if (!task) return this.json({}, 404);
      return await WorkflowHelper.snooze(task, req.body.days, this.repos);
    });
  }

  private async savePhoto(churchId: string, base64Str: string, task: Task) {
    const base64Parts = base64Str.split(",");
    const base64 = base64Parts.length > 1 ? base64Parts[1] : "";
    const key = "/" + churchId + "/membership/people/" + task.associatedWithId + ".png";
    await FileStorageHelper.store(key, "image/png", Buffer.from(base64, "base64"));
    const photoUpdated = new Date();
    const photo: string = Environment.contentRoot + key + "?dt=" + photoUpdated.getTime().toString();
    return photo;
  }

  private async handleDirectoryUpdate(churchId: string, task: Task) {
    if (task.status === "Open") {
      const data = task.data
        ? (() => {
          try {
            return JSON.parse(task.data);
          } catch {
            return [];
          }
        })()
        : [];
      for (const d of data) {
        if (d.field === "photo" && d.value !== undefined) {
          d.value = await this.savePhoto(churchId, d.value, task);
        }
      }
      task.data = JSON.stringify(data);
      task.taskType = "directoryUpdate";
    }
  }
}
