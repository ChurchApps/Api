import { DateHelper } from "@churchapps/apihelper";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { NotificationService } from "../../../shared/helpers/NotificationService.js";
import { Task, Workflow, WorkflowStep, WorkflowStepRoute } from "../models/index.js";
import { ConjunctionHelper } from "./ConjunctionHelper.js";
import { AssignmentWorkflowHelper } from "./AssignmentWorkflowHelper.js";
import { WorkflowTemplate } from "./WorkflowTemplates.js";
import { StepActionHelper } from "./StepActionHelper.js";

interface AssignTarget {
  type?: string;
  id?: string;
  label?: string;
}

export class WorkflowHelper {
  // Guards against route/action cycles while allowing long legit journeys.
  private static readonly MAX_STEP_DEPTH = 25;

  private static async getRepos(repositories?: Repos) {
    return repositories || (await RepoManager.getRepos<Repos>("doing"));
  }

  public static async addToWorkflow(
    churchId: string,
    workflowId: string,
    associated: AssignTarget,
    createdBy?: AssignTarget,
    triggerId?: string,
    repositories?: Repos,
    stepId?: string,
    depth = 0
  ): Promise<Task | null> {
    const repos = await this.getRepos(repositories);
    const workflow = await repos.workflow.load(churchId, workflowId) as Workflow;
    if (workflow?.workflowType === AssignmentWorkflowHelper.workflowType) throw new Error("Issue serving requests from a plan to use this workflow");
    const step = stepId
      ? ((await repos.workflowStep.load(churchId, stepId)) as WorkflowStep)
      : ((await repos.workflowStep.loadForWorkflow(churchId, workflowId)) as WorkflowStep[])[0];
    if (!step) return null;
    const openCard = await this.openCardFor(churchId, workflowId, associated, triggerId, repos);
    if (openCard) return openCard as Task;
    return await this.createCard(churchId, workflowId, step, associated, createdBy, triggerId, repos, undefined, depth);
  }

  public static async addPeopleToWorkflow(
    churchId: string,
    workflowId: string,
    people: AssignTarget[],
    createdBy?: AssignTarget,
    triggerId?: string,
    repositories?: Repos,
    stepId?: string
  ): Promise<Task[]> {
    const repos = await this.getRepos(repositories);
    const workflow = await repos.workflow.load(churchId, workflowId) as Workflow;
    if (workflow?.workflowType === AssignmentWorkflowHelper.workflowType) throw new Error("Issue serving requests from a plan to use this workflow");
    const step = stepId
      ? ((await repos.workflowStep.load(churchId, stepId)) as WorkflowStep)
      : ((await repos.workflowStep.loadForWorkflow(churchId, workflowId)) as WorkflowStep[])[0];
    if (!step) return [];
    const baseSort = await repos.task.loadMaxSortForStep(churchId, workflowId, step.id || "");
    const result: Task[] = [];
    for (const person of people) {
      if (await this.openCardFor(churchId, workflowId, person, triggerId, repos)) continue;
      result.push(await this.createCard(churchId, workflowId, step, person, createdBy, triggerId, repos, baseSort + result.length));
    }
    return result;
  }

  // Manual and step-action adds never give someone a second open card; a closed card does not block.
  // Trigger adds (with a triggerId) keep their own "Only once per person" setting instead.
  private static async openCardFor(churchId: string, workflowId: string, associated: AssignTarget, triggerId: string | undefined, repos: Repos) {
    if (triggerId || !associated?.id) return null;
    return await repos.task.loadOpenBySubjectInWorkflow(churchId, workflowId, associated.type || "person", associated.id);
  }

  private static async createCard(
    churchId: string,
    workflowId: string,
    step: WorkflowStep,
    associated: AssignTarget,
    createdBy?: AssignTarget,
    triggerId?: string,
    repos?: Repos,
    sort?: number,
    depth = 0
  ): Promise<Task> {
    const task: Task = {
      churchId,
      taskType: "card",
      dateCreated: new Date(),
      associatedWithType: associated.type || "person",
      associatedWithId: associated.id,
      associatedWithLabel: associated.label,
      createdByType: createdBy?.type || "system",
      createdById: createdBy?.id,
      createdByLabel: createdBy?.label || "System",
      title: associated.label,
      status: "Open",
      workflowId,
      stepId: step.id,
      triggerId,
      sort: sort ?? (await repos.task.loadMaxSortForStep(churchId, workflowId, step.id || ""))
    };
    // Saved first so step actions (webhooks, history) see the card's id.
    const saved = await repos.task.save(task);
    await this.onStepEnter(saved, step, repos, depth);
    return await repos.task.save(saved);
  }

  // suppressRoutes skips onEnter auto-routing so an explicit manual move stays put.
  public static async moveToStep(task: Task, newStepId: string, repositories?: Repos, suppressRoutes = false): Promise<Task> {
    const repos = await this.getRepos(repositories);
    const step = (await repos.workflowStep.load(task.churchId || "", newStepId)) as WorkflowStep;
    task.stepId = newStepId;
    task.sort = await repos.task.loadMaxSortForStep(task.churchId || "", task.workflowId || "", newStepId);
    if (step) await this.onStepEnter(task, step, repos, 0, suppressRoutes);
    return await repos.task.save(task);
  }

  // Manual moves pass suppressRoutes so a sent-back/dragged card stays put (no actions, no routing).
  public static async onStepEnter(task: Task, step: WorkflowStep, repositories?: Repos, depth = 0, suppressRoutes = false): Promise<void> {
    const repos = await this.getRepos(repositories);

    if (await AssignmentWorkflowHelper.stopIfResolved(task, repos)) return;
    if (task.assignmentId && step.workflowId !== task.workflowId) { await AssignmentWorkflowHelper.close(task, "Workflow step moved", repos); return; }
    const cursor = task.assignmentId ? StepActionHelper.readActionCursor(task) : null;
    task.snoozedUntil = null;
    if (task.assignmentId) {
      task.data = JSON.stringify({ ...AssignmentWorkflowHelper.data(task), entryPending: true });
      await repos.task.save(task);
    }
    if (step.expectedResponseDays) task.dueDate = DateHelper.addDays(new Date(), Number(step.expectedResponseDays));
    if (!task.pinnedAssignment && !task.assignedToId && step.defaultAssignToId) {
      task.assignedToType = step.defaultAssignToType;
      task.assignedToId = step.defaultAssignToId;
      task.assignedToLabel = step.defaultAssignToLabel;
      await this.notifyAssignee(task, `You have been assigned a card: ${task.title || task.associatedWithLabel || ""}`);
    }

    if (!step.id || suppressRoutes || depth >= WorkflowHelper.MAX_STEP_DEPTH) {
      if (task.assignmentId) task.data = JSON.stringify({ ...AssignmentWorkflowHelper.data(task), entryPending: false });
      return;
    }

    // A delay parks the card; processSnoozed resumes the rest on wake.
    const parked = await StepActionHelper.execute(task, step, repos, cursor?.stepId === step.id ? cursor.index : 0, depth);
    if (parked) return;

    if (task.assignmentId) task.data = JSON.stringify({ ...AssignmentWorkflowHelper.data(task), entryPending: false });
    const advanced = await this.applyEntryRoutes(task, step, repos, depth);
    if (task.assignmentId && !advanced && task.status === "Open" && !task.assignedToId) {
      await AssignmentWorkflowHelper.defaultAssignee(task, repos);
      await this.notifyAssignee(task, `Serving follow-up needs attention: ${task.title || ""}`);
    }
  }

  // Returns true when a matched route advanced the card to another step.
  private static async applyEntryRoutes(task: Task, step: WorkflowStep, repos: Repos, depth: number): Promise<boolean> {
    if (await AssignmentWorkflowHelper.stopIfResolved(task, repos)) return false;
    if (depth >= WorkflowHelper.MAX_STEP_DEPTH || !step.id) return false;
    const routes = (await repos.workflowStepRoute.loadForStep(task.churchId || "", step.id)) as WorkflowStepRoute[];
    const onEnter = routes.filter((r) => r.trigger === "onEnter");
    for (const route of onEnter) {
      let matched = false;
      if (route.kind === "always") matched = true;
      else if (route.kind === "personMatch" && task.associatedWithType === "person" && task.associatedWithId) {
        // A bad condition must not strand a half-saved card; treat the route as not matched.
        try {
          matched = await ConjunctionHelper.personMatchesStepRoute(task.churchId || "", route.id || "", task.associatedWithId, repos);
        } catch (e) {
          console.error(`[WorkflowHelper] route ${route.id} condition check failed for card ${task.id || "?"}:`, e);
        }
      }
      if (!matched) continue;
      if (route.targetStepId && route.targetStepId !== task.stepId) {
        const next = (await repos.workflowStep.load(task.churchId || "", route.targetStepId)) as WorkflowStep;
        if (next) {
          task.stepId = next.id;
          task.sort = await repos.task.loadMaxSortForStep(task.churchId || "", task.workflowId || "", next.id || "");
          await this.onStepEnter(task, next, repos, depth + 1);
          return true;
        }
      }
      return false;
    }
    return false;
  }

  public static async complete(task: Task, repositories?: Repos, routeId?: string): Promise<Task> {
    const repos = await this.getRepos(repositories);
    if (routeId) {
      const route = (await repos.workflowStepRoute.load(task.churchId || "", routeId)) as WorkflowStepRoute;
      if (route && route.stepId !== task.stepId) throw new Error("Route does not belong to this card's step");
      if (route && route.targetWorkflowId && route.targetWorkflowId !== task.workflowId) {
        if (task.assignmentId) throw new Error("Serving confirmation cannot hand off to another workflow");
        return await this.handOffToWorkflow(task, route.targetWorkflowId, repos);
      }
      if (route && route.targetStepId) return await this.moveToStep(task, route.targetStepId, repos);
    }
    return await this.closeCard(task, repos);
  }

  private static async closeCard(task: Task, repos: Repos): Promise<Task> {
    if (task.assignmentId) return AssignmentWorkflowHelper.completeHumanFollowup(task, repos);
    task.status = "Closed";
    task.dateClosed = new Date();
    return await repos.task.save(task);
  }

  // Close one card without running outcomes or routes, the same way deleting a workflow closes its cards.
  public static async remove(task: Task, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    if (task.assignmentId) {
      await repos.task.withAssignmentLock(task.churchId || "", task.assignmentId, async () => {
        const current = await repos.task.load(task.churchId || "", task.id || "");
        if (current?.status === "Open") await AssignmentWorkflowHelper.close(current, "Removed", repos);
      });
      return (await repos.task.load(task.churchId || "", task.id || "")) || task;
    }
    StepActionHelper.appendHistory(task, "Removed");
    task.status = "Closed";
    task.dateClosed = new Date();
    task.snoozedUntil = null;
    return await repos.task.save(task);
  }

  // Close the source card and start a fresh card for the same person in the target workflow.
  private static async handOffToWorkflow(task: Task, targetWorkflowId: string, repos: Repos): Promise<Task> {
    if (task.associatedWithId) {
      await this.addToWorkflow(
        task.churchId || "",
        targetWorkflowId,
        { type: task.associatedWithType || "person", id: task.associatedWithId, label: task.associatedWithLabel },
        { type: "system", label: "System" },
        undefined,
        repos
      );
    }
    return await this.closeCard(task, repos);
  }

  public static async snooze(task: Task, days: number, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    task.snoozedUntil = DateHelper.addDays(new Date(), Number(days));
    return await repos.task.save(task);
  }

  public static async reassign(task: Task, target: AssignTarget, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    task.assignedToType = target.type;
    task.assignedToId = target.id;
    task.assignedToLabel = target.label;
    const saved = await repos.task.save(task);
    await this.notifyAssignee(saved, `You have been assigned a card: ${saved.title || ""}`);
    return saved;
  }

  public static async setPinned(task: Task, pinned: boolean, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    task.pinnedAssignment = pinned;
    return await repos.task.save(task);
  }

  // direction: +1 = skip forward, -1 = send back. Manual move, so routes don't re-fire.
  public static async moveRelative(task: Task, direction: 1 | -1, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    const steps = (await repos.workflowStep.loadForWorkflow(task.churchId || "", task.workflowId || "")) as WorkflowStep[];
    const index = steps.findIndex((s) => s.id === task.stepId);
    if (index === -1) return task;
    const target = steps[index + direction];
    if (!target || !target.id) return task;
    return await this.moveToStep(task, target.id, repos, true);
  }

  public static async duplicateWorkflow(churchId: string, workflowId: string, repositories?: Repos): Promise<Workflow | null> {
    const repos = await this.getRepos(repositories);
    const source = (await repos.workflow.load(churchId, workflowId)) as Workflow;
    if (!source) return null;
    const steps = (await repos.workflowStep.loadForWorkflow(churchId, workflowId)) as WorkflowStep[];

    const newWorkflow = (await repos.workflow.save({ churchId, name: `${source.name || "Workflow"} (copy)`, categoryId: source.categoryId, active: source.active, sort: source.sort, workflowType: source.workflowType })) as Workflow;
    const createdStepIds: string[] = [];
    const stepMap = new Map<string, string>();
    try {
      for (const step of steps) {
        const newStep = (await repos.workflowStep.save({
          churchId,
          workflowId: newWorkflow.id,
          name: step.name,
          sort: step.sort,
          defaultAssignToType: step.defaultAssignToType,
          defaultAssignToId: step.defaultAssignToId,
          defaultAssignToLabel: step.defaultAssignToLabel,
          expectedResponseDays: step.expectedResponseDays
        })) as WorkflowStep;
        if (newStep.id) createdStepIds.push(newStep.id);
        if (step.id && newStep.id) {
          stepMap.set(step.id, newStep.id);
          const actions = (await repos.workflowStepAction.loadForStep(churchId, step.id)) as any[];
          for (const action of actions) {
            await repos.workflowStepAction.save({ churchId, stepId: newStep.id, sort: action.sort, actionType: action.actionType, config: action.config });
          }
        }
      }
      if (source.workflowType === AssignmentWorkflowHelper.workflowType) {
        for (const route of await repos.workflowStepRoute.loadForWorkflow(churchId, workflowId) as WorkflowStepRoute[]) {
          const savedRoute = await repos.workflowStepRoute.save({
            ...route,
            id: undefined,
            workflowId: newWorkflow.id,
            stepId: stepMap.get(route.stepId),
            targetStepId: stepMap.get(route.targetStepId) || route.targetStepId
          });
          const groups = await repos.conjunction.loadForStepRoute(churchId, route.id);
          const groupMap = new Map<string, string>();
          for (const group of groups) {
            const saved = await repos.conjunction.save({ ...group, id: undefined, stepRouteId: savedRoute.id, parentId: undefined, conjunctions: [], conditions: [] });
            groupMap.set(group.id, saved.id);
          }
          for (const group of groups) if (group.parentId) await repos.conjunction.save({ ...group, id: groupMap.get(group.id), stepRouteId: savedRoute.id, parentId: groupMap.get(group.parentId), conjunctions: [], conditions: [] });
          for (const condition of await repos.condition.loadForStepRoute(churchId, route.id)) await repos.condition.save({ ...condition, id: undefined, conjunctionId: groupMap.get(condition.conjunctionId) });
        }
      }
    } catch (err) {
      await this.rollbackWorkflow(repos, churchId, newWorkflow.id, createdStepIds, "duplicateWorkflow", err);
      throw err;
    }
    return newWorkflow;
  }

  public static async createFromTemplate(churchId: string, template: WorkflowTemplate, name?: string, repositories?: Repos): Promise<Workflow> {
    const repos = await this.getRepos(repositories);
    const workflow = (await repos.workflow.save({ churchId, name: name || template.name, active: true, workflowType: template.workflowType })) as Workflow;
    const createdStepIds: string[] = [];
    try {
      let sort = 1;
      for (const step of template.steps) {
        const newStep = (await repos.workflowStep.save({ churchId, workflowId: workflow.id, name: step.name, sort: sort++, expectedResponseDays: step.expectedResponseDays })) as WorkflowStep;
        if (newStep.id) createdStepIds.push(newStep.id);
        for (const [index, action] of (step.actions || []).entries()) {
          await repos.workflowStepAction.save({ churchId, stepId: newStep.id, sort: index + 1, actionType: action.actionType, config: JSON.stringify(action.config || {}) });
        }
      }
      for (let i = 0; i < template.steps.length - 1; i++) {
        if (template.steps[i].advance) await repos.workflowStepRoute.save({ churchId, workflowId: workflow.id, stepId: createdStepIds[i], targetStepId: createdStepIds[i + 1], trigger: "onEnter", kind: "always", sort: 1 });
      }
    } catch (err) {
      await this.rollbackWorkflow(repos, churchId, workflow.id, createdStepIds, "createFromTemplate", err);
      throw err;
    }
    return workflow;
  }

  private static async rollbackWorkflow(repos: Repos, churchId: string, workflowId: string | undefined, stepIds: string[], op: string, cause: unknown): Promise<void> {
    console.error(`[WorkflowHelper] ${op} failed; rolling back partial workflow`, cause);
    try {
      for (const route of await repos.workflowStepRoute.loadForWorkflow(churchId, workflowId)) {
        for (const condition of await repos.condition.loadForStepRoute(churchId, route.id)) await repos.condition.delete(churchId, condition.id);
        for (const group of await repos.conjunction.loadForStepRoute(churchId, route.id)) await repos.conjunction.delete(churchId, group.id);
        await repos.workflowStepRoute.delete(churchId, route.id);
      }
    } catch (cleanupErr) { console.error(`[WorkflowHelper] ${op} rollback: failed to delete routes`, cleanupErr); }
    for (const id of stepIds) {
      try {
        await repos.workflowStepAction.deleteForStep(churchId, id);
        await repos.workflowStep.delete(churchId, id);
      } catch (cleanupErr) {
        console.error(`[WorkflowHelper] ${op} rollback: failed to delete step ${id}`, cleanupErr);
      }
    }
    if (workflowId) {
      try {
        await repos.workflow.delete(churchId, workflowId);
      } catch (cleanupErr) {
        console.error(`[WorkflowHelper] ${op} rollback: failed to delete workflow ${workflowId}`, cleanupErr);
      }
    }
  }

  public static async processOverdue(repositories?: Repos): Promise<number> {
    const repos = await this.getRepos(repositories);
    const overdue = (await repos.task.loadOverdueAllChurches()) as Task[];
    for (const card of overdue) {
      if (card.assignmentId) {
        await repos.task.withAssignmentLock(card.churchId, card.assignmentId, async () => {
          const current = await repos.task.load(card.churchId, card.id) as Task;
          if (current && !await AssignmentWorkflowHelper.stopIfResolved(current, repos)) await this.notifyAssignee(current, `Card overdue: ${current.title || current.associatedWithLabel || ""}`);
        });
      } else await this.notifyAssignee(card, `Card overdue: ${card.title || card.associatedWithLabel || ""}`);
    }
    return overdue.length;
  }

  public static async processSnoozed(repositories?: Repos): Promise<number> {
    const repos = await this.getRepos(repositories);
    const cards = (await repos.task.loadSnoozedDueAllChurches()) as Task[];
    for (const card of cards) {
      if (card.assignmentId) continue; // reconciled under the assignment lock below
      card.snoozedUntil = null;
      const cursor = StepActionHelper.readActionCursor(card);
      const step = card.stepId ? ((await repos.workflowStep.load(card.churchId || "", card.stepId)) as WorkflowStep) : null;
      if (step && cursor && cursor.stepId === card.stepId) {
        // Resume a drip parked by a delay; otherwise it's an ordinary human snooze.
        const parked = await StepActionHelper.execute(card, step, repos, cursor.index);
        if (!parked) await this.applyEntryRoutes(card, step, repos, 0);
        await repos.task.save(card);
      } else {
        await repos.task.save(card);
        await this.notifyAssignee(card, `Snooze ended: ${card.title || card.associatedWithLabel || ""}`);
      }
    }
    await AssignmentWorkflowHelper.processPending(repos);
    return cards.length;
  }

  private static async notifyAssignee(task: Task, message: string): Promise<void> {
    if (task.assignedToType !== "person" || !task.assignedToId) return;
    try {
      await NotificationService.createNotifications([task.assignedToId], task.churchId || "", "task", task.id || "", message);
    } catch (err) {
      console.warn(`[WorkflowHelper] notifyAssignee skipped for task ${task.id || "?"}:`, (err as Error)?.message || err);
    }
  }
}
