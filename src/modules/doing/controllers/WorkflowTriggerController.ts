import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { DoingBaseController } from "./DoingBaseController.js";
import { AutomationExecution, Condition, Conjunction, WorkflowTrigger } from "../models/index.js";
import { EventTriggerHelper, ExecutionHelper, RuleEngine } from "../helpers/index.js";
import { Permissions } from "../../../shared/helpers/index.js";

@controller("/doing/workflowTriggers")
export class WorkflowTriggerController extends DoingBaseController {
  // Internal cron hook (no user context) for the scheduled (pull) rules. Gated by the
  // INTERNAL_API_KEY shared secret; fails closed if the header or env var is missing.
  // The real driver is the lambda timer; this is a manual/external fallback.
  @httpGet("/check")
  public async check(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const requiredKey = process.env.INTERNAL_API_KEY;
      if (!requiredKey || req.header("x-internal-key") !== requiredKey) return this.json({}, 401);
      await RuleEngine.runScheduled();
      return { success: true };
    });
  }

  // Static catalog of triggerable events + their condition fields for the B1Admin builder.
  @httpGet("/fields")
  public async getFields(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return EventTriggerHelper.fieldDefs();
    });
  }

  @httpGet("/workflow/:workflowId")
  public async getForWorkflow(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.workflowTrigger.loadByWorkflow(au.churchId, workflowId);
    });
  }

  @httpGet("/executions/workflow/:workflowId")
  public async getExecutionsForWorkflow(@requestParam("workflowId") workflowId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.automationExecution.loadForWorkflow(au.churchId, workflowId);
    });
  }

  @httpGet("/:id/executions")
  public async getExecutionsForTrigger(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.view)) return this.json({}, 401);
      return await this.repos.automationExecution.loadForTrigger(au.churchId, id);
    });
  }

  // Re-attempts a failed/paused execution immediately (counts as a fresh attempt window).
  @httpPost("/executions/:id/retry")
  public async retryExecution(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const execution = (await this.repos.automationExecution.load(au.churchId, id)) as AutomationExecution;
      if (!execution) return this.json({}, 404);
      if (execution.status === "success") return this.json({ error: "Execution already succeeded" }, 400);
      const trigger = (await this.repos.workflowTrigger.load(au.churchId, execution.triggerId || "")) as WorkflowTrigger;
      if (!trigger) return this.json({ error: "Trigger no longer exists" }, 400);
      execution.status = "pending";
      execution.dateCompleted = undefined;
      return await ExecutionHelper.attempt(execution, trigger, this.repos);
    });
  }

  @httpPost("/executions/:id/pause")
  public async pauseExecution(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const execution = (await this.repos.automationExecution.load(au.churchId, id)) as AutomationExecution;
      if (!execution) return this.json({}, 404);
      if (execution.status !== "pending") return this.json({ error: "Only pending executions can be paused" }, 400);
      execution.status = "paused";
      execution.nextAttemptAt = undefined;
      return await this.repos.automationExecution.save(execution);
    });
  }

  @httpPost("/executions/:id/resume")
  public async resumeExecution(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const execution = (await this.repos.automationExecution.load(au.churchId, id)) as AutomationExecution;
      if (!execution) return this.json({}, 404);
      if (execution.status !== "paused") return this.json({ error: "Only paused executions can be resumed" }, 400);
      execution.status = "pending";
      execution.nextAttemptAt = new Date();
      return await this.repos.automationExecution.save(execution);
    });
  }

  // Pause-all: deactivates the trigger (no new firings) and parks its queued retries.
  @httpPost("/:id/pauseAll")
  public async pauseAll(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const trigger = (await this.repos.workflowTrigger.load(au.churchId, id)) as WorkflowTrigger;
      if (!trigger) return this.json({}, 404);
      trigger.active = false;
      await this.repos.workflowTrigger.save(trigger);
      await this.repos.automationExecution.setStatusForTrigger(au.churchId, id, "pending", "paused");
      EventTriggerHelper.invalidate(au.churchId);
      return trigger;
    });
  }

  @httpPost("/:id/resumeAll")
  public async resumeAll(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const trigger = (await this.repos.workflowTrigger.load(au.churchId, id)) as WorkflowTrigger;
      if (!trigger) return this.json({}, 404);
      trigger.active = true;
      await this.repos.workflowTrigger.save(trigger);
      await this.repos.automationExecution.setStatusForTrigger(au.churchId, id, "paused", "pending");
      EventTriggerHelper.invalidate(au.churchId);
      return trigger;
    });
  }

  // Bulk-apply-on-create: run the automation against everything that currently matches.
  @httpPost("/:id/runNow")
  public async runNow(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      const trigger = (await this.repos.workflowTrigger.load(au.churchId, id)) as WorkflowTrigger;
      if (!trigger) return this.json({}, 404);
      try {
        return await ExecutionHelper.runNow(trigger, this.repos);
      } catch (err) {
        return this.json({ error: (err as Error)?.message || "Run now failed" }, 400);
      }
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
      const result: WorkflowTrigger[] = [];
      for (const trigger of req.body) {
        trigger.churchId = au.churchId;
        const saved = (await this.repos.workflowTrigger.save(trigger)) as WorkflowTrigger;
        // Schedule rules carry a relational condition tree (like personMatch routes),
        // so they need a root conjunction to hang conditions off of.
        if (saved.triggerKind === "schedule") {
          const existing = (await this.repos.conjunction.loadForTrigger(au.churchId, saved.id || "")) as Conjunction[];
          if (!existing || existing.length === 0) {
            await this.repos.conjunction.save({ churchId: au.churchId, triggerId: saved.id, parentId: null, groupType: "and" } as Conjunction);
          }
        }
        result.push(saved);
      }
      EventTriggerHelper.invalidate(au.churchId);
      return result;
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.tasks.admin)) return this.json({}, 401);
      // Tear down any condition tree (schedule rules) before the trigger itself.
      const conditions = (await this.repos.condition.loadForTrigger(au.churchId, id)) as Condition[];
      for (const c of conditions) if (c.id) await this.repos.condition.delete(au.churchId, c.id);
      const conjunctions = (await this.repos.conjunction.loadForTrigger(au.churchId, id)) as Conjunction[];
      for (const cj of conjunctions) if (cj.id) await this.repos.conjunction.delete(au.churchId, cj.id);
      await this.repos.workflowTrigger.delete(au.churchId, id);
      EventTriggerHelper.invalidate(au.churchId);
      return {};
    });
  }
}
