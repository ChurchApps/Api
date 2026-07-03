import { controller, httpPost, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { Task } from "../models/index.js";
import { WorkflowHelper, DirectoryUpdateHelper } from "../helpers/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { InternalEventBus } from "../../../shared/events/InternalEventBus.js";

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

  @httpGet("/board/:workflowId")
  public async getBoard(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      const [workflow, steps, cards, routes, actions] = await Promise.all([
        this.repos.workflow.load(au.churchId, workflowId),
        this.repos.workflowStep.loadForWorkflow(au.churchId, workflowId),
        this.repos.task.loadByWorkflow(au.churchId, workflowId, "Open"),
        this.repos.workflowStepRoute.loadForWorkflow(au.churchId, workflowId),
        this.repos.workflowStepAction.loadForWorkflow(au.churchId, workflowId)
      ]);
      return { workflow, steps, cards, routes, actions };
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
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.task.loadForGroups(au.churchId, req.body.groupIds, req.body.status);
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Task[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      // Member directory updates are self-service; staff task creation requires Edit.
      if (req.query?.type !== "directoryUpdate" && !au.checkAccess(Permissions.tasks.edit)) return this.json({}, 401);
      // Cards must use the card endpoints (which run routing + per-card permissions).
      if (req.body.some((task) => task.workflowId || task.stepId)) return this.json({ message: "Workflow cards must use the card endpoints" }, 400);
      const result: Task[] = [];
      for (const task of req.body) {
        task.churchId = au.churchId;
        if (req.query?.type === "directoryUpdate") await DirectoryUpdateHelper.handleDirectoryUpdate(au.churchId, task);
        const saved = await this.repos.task.save(task);
        await InternalEventBus.publish(au.churchId, "task.updated", saved);
        result.push(saved);
      }
      return result;
    });
  }

  @httpPost("/addToWorkflow")
  public async addToWorkflow(req: express.Request<{}, {}, { workflowId: string; stepId?: string; associatedWith: { type?: string; id?: string; label?: string } }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.edit)) return this.json({}, 401);
      const { workflowId, stepId, associatedWith } = req.body;
      return await WorkflowHelper.addToWorkflow(au.churchId, workflowId, associatedWith || {}, this.actor(au), undefined, this.repos, stepId);
    });
  }

  @httpPost("/bulkAddToWorkflow")
  public async bulkAddToWorkflow(req: express.Request<{}, {}, { workflowId: string; stepId?: string; people?: { id: string; label?: string }[]; listId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.edit)) return this.json({}, 401);
      const { workflowId, stepId, people } = req.body;
      const targets = (people || []).map((p) => ({ type: "person", id: p.id, label: p.label }));
      return await WorkflowHelper.addPeopleToWorkflow(au.churchId, workflowId, targets, this.actor(au), undefined, this.repos, stepId);
    });
  }

  private actor(au: { personId?: string; firstName?: string; lastName?: string }) {
    return { type: "person", id: au.personId, label: au.firstName ? au.firstName + " " + au.lastName : "" };
  }

  // Bulk routes are declared before /:id/* so "bulk" isn't captured as an id.

  // authz-exempt: gated by bulkApply → canEditCard(au, task) per card (tasks.edit or assignee)
  @httpPost("/bulk/moveStep")
  public async bulkMoveStep(req: express.Request<{}, {}, { ids: string[]; stepId: string }>, res: express.Response): Promise<any> {
    return this.bulkApply(req, res, async (task) => WorkflowHelper.moveToStep(task, req.body.stepId, this.repos, true));
  }

  // authz-exempt: gated by bulkApply → canEditCard(au, task) per card (tasks.edit or assignee)
  @httpPost("/bulk/complete")
  public async bulkComplete(req: express.Request<{}, {}, { ids: string[] }>, res: express.Response): Promise<any> {
    return this.bulkApply(req, res, async (task) => WorkflowHelper.complete(task, this.repos));
  }

  // authz-exempt: gated by bulkApply → canEditCard(au, task) per card (tasks.edit or assignee)
  @httpPost("/bulk/reassign")
  public async bulkReassign(req: express.Request<{}, {}, { ids: string[]; assignedToType?: string; assignedToId?: string; assignedToLabel?: string }>, res: express.Response): Promise<any> {
    return this.bulkApply(req, res, async (task) =>
      WorkflowHelper.reassign(task, { type: req.body.assignedToType, id: req.body.assignedToId, label: req.body.assignedToLabel }, this.repos));
  }

  // authz-exempt: gated by bulkApply → canEditCard(au, task) per card (tasks.edit or assignee)
  @httpPost("/bulk/snooze")
  public async bulkSnooze(req: express.Request<{}, {}, { ids: string[]; days: number }>, res: express.Response): Promise<any> {
    return this.bulkApply(req, res, async (task) => WorkflowHelper.snooze(task, req.body.days, this.repos));
  }

  // Applies op to each editable card, reporting updated vs. skipped (missing/denied) ids.
  private async bulkApply(req: express.Request<{}, {}, { ids: string[] }>, res: express.Response, op: (task: Task) => Promise<Task>): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const ids = req.body.ids || [];
      const tasks = (await Promise.all(ids.map((id) => this.repos.task.load(au.churchId, id)))) as (Task | null)[];
      const updated: string[] = [];
      const skipped: string[] = [];
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (!task || !this.canEditCard(au, task)) {
          skipped.push(ids[i]);
          continue;
        }
        await op(task);
        updated.push(ids[i]);
      }
      return { updated, skipped };
    });
  }

  // Single-card analogue of bulkApply: load, enforce per-card edit permission, run op.
  private async withCard(req: express.Request, res: express.Response, id: string, op: (task: Task) => Promise<any>): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const task = (await this.repos.task.load(au.churchId, id)) as Task;
      if (!task) return this.json({}, 404);
      if (!this.canEditCard(au, task)) return this.json({}, 401);
      return await op(task);
    });
  }

  // authz-exempt: gated by withCard → canEditCard(au, task) (tasks.edit or assignee)
  @httpPost("/:id/moveStep")
  public async moveStep(@requestParam("id") id: string, req: express.Request<{}, {}, { stepId: string }>, res: express.Response): Promise<any> {
    // Manual placement: suppress onEnter routing so the card stays where it was dropped.
    return this.withCard(req, res, id, (task) => WorkflowHelper.moveToStep(task, req.body.stepId, this.repos, true));
  }

  // authz-exempt: gated by withCard → canEditCard(au, task) (tasks.edit or assignee)
  @httpPost("/:id/skip")
  public async skip(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.withCard(req, res, id, (task) => WorkflowHelper.moveRelative(task, 1, this.repos));
  }

  // authz-exempt: gated by withCard → canEditCard(au, task) (tasks.edit or assignee)
  @httpPost("/:id/sendBack")
  public async sendBack(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.withCard(req, res, id, (task) => WorkflowHelper.moveRelative(task, -1, this.repos));
  }

  // authz-exempt: gated by withCard → canEditCard(au, task) (tasks.edit or assignee)
  @httpPost("/:id/complete")
  public async complete(@requestParam("id") id: string, req: express.Request<{}, {}, { routeId?: string }>, res: express.Response): Promise<any> {
    return this.withCard(req, res, id, (task) => WorkflowHelper.complete(task, this.repos, req.body?.routeId));
  }

  // authz-exempt: gated by withCard → canEditCard(au, task) (tasks.edit or assignee)
  @httpPost("/:id/reassign")
  public async reassign(@requestParam("id") id: string, req: express.Request<{}, {}, { assignedToType?: string; assignedToId?: string; assignedToLabel?: string }>, res: express.Response): Promise<any> {
    return this.withCard(req, res, id, (task) => WorkflowHelper.reassign(task, { type: req.body.assignedToType, id: req.body.assignedToId, label: req.body.assignedToLabel }, this.repos));
  }

  // authz-exempt: gated by withCard → canEditCard(au, task) (tasks.edit or assignee)
  @httpPost("/:id/pin")
  public async pin(@requestParam("id") id: string, req: express.Request<{}, {}, { pinned: boolean }>, res: express.Response): Promise<any> {
    return this.withCard(req, res, id, (task) => WorkflowHelper.setPinned(task, req.body.pinned !== false, this.repos));
  }

  // authz-exempt: gated by withCard → canEditCard(au, task) (tasks.edit or assignee)
  @httpPost("/:id/snooze")
  public async snooze(@requestParam("id") id: string, req: express.Request<{}, {}, { days: number }>, res: express.Response): Promise<any> {
    return this.withCard(req, res, id, (task) => WorkflowHelper.snooze(task, req.body.days, this.repos));
  }

}
