import { DateHelper } from "@churchapps/apihelper";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Action, Task, Workflow, WorkflowStep, WorkflowStepRoute } from "../models/index.js";
import { ConjunctionHelper } from "./ConjunctionHelper.js";

interface AssignTarget {
  type?: string;
  id?: string;
  label?: string;
}

export class WorkflowHelper {
  private static async getRepos(repositories?: Repos) {
    return repositories || (await RepoManager.getRepos<Repos>("doing"));
  }

  // Add a person to a workflow as a card. Defaults to the first step; pass stepId
  // to drop the card directly on a specific step (e.g. a Kanban column's "+").
  public static async addToWorkflow(
    churchId: string,
    workflowId: string,
    associated: AssignTarget,
    createdBy?: AssignTarget,
    automationId?: string,
    repositories?: Repos,
    stepId?: string
  ): Promise<Task | null> {
    const repos = await this.getRepos(repositories);
    const step = stepId
      ? ((await repos.workflowStep.load(churchId, stepId)) as WorkflowStep)
      : ((await repos.workflowStep.loadForWorkflow(churchId, workflowId)) as WorkflowStep[])[0];
    if (!step) return null;
    return await this.createCard(churchId, workflowId, step, associated, createdBy, automationId, repos);
  }

  // Bulk add: resolves the target step (and its on-enter actions) once, then
  // creates a card per person — avoids re-querying them for every person.
  // Defaults to the workflow's first step; pass stepId to add directly to a column.
  public static async addPeopleToWorkflow(
    churchId: string,
    workflowId: string,
    people: AssignTarget[],
    createdBy?: AssignTarget,
    automationId?: string,
    repositories?: Repos,
    stepId?: string
  ): Promise<Task[]> {
    const repos = await this.getRepos(repositories);
    const step = stepId
      ? ((await repos.workflowStep.load(churchId, stepId)) as WorkflowStep)
      : ((await repos.workflowStep.loadForWorkflow(churchId, workflowId)) as WorkflowStep[])[0];
    if (!step) return [];
    const actions = step.id ? ((await repos.action.loadForStep(churchId, step.id)) as Action[]) : [];
    const result: Task[] = [];
    for (const p of people) {
      result.push(await this.createCard(churchId, workflowId, step, p, createdBy, automationId, repos, actions));
    }
    return result;
  }

  private static async createCard(
    churchId: string,
    workflowId: string,
    step: WorkflowStep,
    associated: AssignTarget,
    createdBy?: AssignTarget,
    automationId?: string,
    repos?: Repos,
    actions?: Action[]
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
      automationId,
      sort: await repos.task.loadMaxSortForStep(churchId, workflowId, step.id || "")
    };
    await this.onStepEnter(task, step, repos, 0, actions);
    return await repos.task.save(task);
  }

  // Move an existing card to a different step, applying that step's on-enter logic.
  public static async moveToStep(task: Task, newStepId: string, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    const step = (await repos.workflowStep.load(task.churchId || "", newStepId)) as WorkflowStep;
    task.stepId = newStepId;
    task.sort = await repos.task.loadMaxSortForStep(task.churchId || "", task.workflowId || "", newStepId);
    if (step) await this.onStepEnter(task, step, repos, 0);
    return await repos.task.save(task);
  }

  // Central step-entry logic: due date from expectedResponseDays, default assignee, and on-enter actions.
  public static async onStepEnter(task: Task, step: WorkflowStep, repositories?: Repos, depth = 0, preloadedActions?: Action[]): Promise<void> {
    const repos = await this.getRepos(repositories);

    task.snoozedUntil = undefined;
    if (step.expectedResponseDays) task.dueDate = DateHelper.addDays(new Date(), Number(step.expectedResponseDays));
    // Pinned cards keep their owner across steps; otherwise an unassigned card
    // picks up the step's default assignee.
    if (!task.pinnedAssignment && !task.assignedToId && step.defaultAssignToId) {
      task.assignedToType = step.defaultAssignToType;
      task.assignedToId = step.defaultAssignToId;
      task.assignedToLabel = step.defaultAssignToLabel;
    }

    if (!step.id) return;
    const actions = preloadedActions ?? ((await repos.action.loadForStep(task.churchId || "", step.id)) as Action[]);
    for (const action of actions) {
      try {
        await this.runStepAction(task, action, repos, depth);
      } catch {
        // One failed action shouldn't block the transition.
      }
    }

    // Conditional auto-routing: the first matching onEnter route advances the card.
    await this.applyEntryRoutes(task, step, repos, depth);
  }

  // Evaluate a step's onEnter routes (in sort order) when a card lands on it.
  // The first route that matches — a personMatch whose condition tree includes the
  // card's person, or an unconditional `always` — advances the card to its target,
  // recursing through that step's own entry logic. The depth guard prevents loops.
  private static async applyEntryRoutes(task: Task, step: WorkflowStep, repos: Repos, depth: number): Promise<void> {
    if (depth >= 5 || !step.id) return;
    const routes = (await repos.workflowStepRoute.loadForStep(task.churchId || "", step.id)) as WorkflowStepRoute[];
    const onEnter = routes.filter((r) => r.trigger === "onEnter");
    for (const route of onEnter) {
      let matched = false;
      if (route.kind === "always") matched = true;
      else if (route.kind === "personMatch" && task.associatedWithType === "person" && task.associatedWithId) {
        matched = await ConjunctionHelper.personMatchesStepRoute(task.churchId || "", route.id || "", task.associatedWithId, repos);
      }
      if (!matched) continue;
      if (route.targetStepId && route.targetStepId !== task.stepId) {
        const next = (await repos.workflowStep.load(task.churchId || "", route.targetStepId)) as WorkflowStep;
        if (next) {
          task.stepId = next.id;
          task.sort = await repos.task.loadMaxSortForStep(task.churchId || "", task.workflowId || "", next.id || "");
          await this.onStepEnter(task, next, repos, depth + 1);
        }
      }
      // First matching route wins, whether or not it had a usable target.
      return;
    }
  }

  private static async runStepAction(task: Task, action: Action, repos: Repos, depth: number): Promise<void> {
    const data = action.actionData ? JSON.parse(action.actionData) : {};
    switch (action.actionType) {
      case "autoAssign":
        // A pinned card keeps its owner — don't let a step action reassign it.
        if (!task.pinnedAssignment) {
          task.assignedToType = data.assignedToType;
          task.assignedToId = data.assignedToId;
          task.assignedToLabel = data.assignedToLabel;
        }
        break;
      case "autoAdvance":
        // Guard against auto-advance loops.
        if (depth < 5 && data.targetStepId && data.targetStepId !== task.stepId) {
          const next = (await repos.workflowStep.load(task.churchId || "", data.targetStepId)) as WorkflowStep;
          if (next) {
            task.stepId = next.id;
            task.sort = await repos.task.loadMaxSortForStep(task.churchId || "", task.workflowId || "", next.id || "");
            await this.onStepEnter(task, next, repos, depth + 1);
          }
        }
        break;
      case "sendEmail":
      case "sendText":
        await this.notifyAssignee(task, data.message || `Workflow update for ${task.associatedWithLabel}`);
        break;
    }
  }

  // Complete a card. When a routeId is supplied (an onComplete "outcome" the user
  // picked), the card is routed by that outcome: a route with a targetStepId moves
  // the card to that step (re-running its entry logic); a route with no target — or
  // no routeId at all — closes the card.
  public static async complete(task: Task, repositories?: Repos, routeId?: string): Promise<Task> {
    const repos = await this.getRepos(repositories);
    if (routeId) {
      const route = (await repos.workflowStepRoute.load(task.churchId || "", routeId)) as WorkflowStepRoute;
      if (route && route.targetStepId) return await this.moveToStep(task, route.targetStepId, repos);
    }
    task.status = "Closed";
    task.dateClosed = new Date();
    return await repos.task.save(task);
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

  // Toggle whether a card keeps its current owner across step changes.
  public static async setPinned(task: Task, pinned: boolean, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    task.pinnedAssignment = pinned;
    return await repos.task.save(task);
  }

  // Move a card to the neighbouring step (by sort order). direction: +1 = skip
  // forward, -1 = send back. No-op (returns the card unchanged) at either end.
  public static async moveRelative(task: Task, direction: 1 | -1, repositories?: Repos): Promise<Task> {
    const repos = await this.getRepos(repositories);
    const steps = (await repos.workflowStep.loadForWorkflow(task.churchId || "", task.workflowId || "")) as WorkflowStep[];
    const index = steps.findIndex((s) => s.id === task.stepId);
    if (index === -1) return task;
    const target = steps[index + direction];
    if (!target || !target.id) return task;
    return await this.moveToStep(task, target.id, repos);
  }

  // Deep-copy a workflow: its steps and each step's on-enter actions get fresh
  // ids. Cards are NOT copied. Returns the new workflow.
  public static async duplicateWorkflow(churchId: string, workflowId: string, repositories?: Repos): Promise<Workflow | null> {
    const repos = await this.getRepos(repositories);
    const source = (await repos.workflow.load(churchId, workflowId)) as Workflow;
    if (!source) return null;
    const steps = (await repos.workflowStep.loadForWorkflow(churchId, workflowId)) as WorkflowStep[];

    const newWorkflow = (await repos.workflow.save({ churchId, name: `${source.name || "Workflow"} (copy)`, categoryId: source.categoryId, active: source.active, sort: source.sort })) as Workflow;
    for (const step of steps) {
      const actions = step.id ? ((await repos.action.loadForStep(churchId, step.id)) as Action[]) : [];
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
      for (const action of actions) {
        await repos.action.save({ churchId, stepId: newStep.id, actionType: action.actionType, actionData: action.actionData });
      }
    }
    return newWorkflow;
  }

  // Create a workflow (and its steps) from a hardcoded starter template.
  public static async createFromTemplate(churchId: string, template: { name: string; steps: { name: string; expectedResponseDays?: number }[] }, name?: string, repositories?: Repos): Promise<Workflow> {
    const repos = await this.getRepos(repositories);
    const workflow = (await repos.workflow.save({ churchId, name: name || template.name, active: true })) as Workflow;
    let sort = 1;
    for (const step of template.steps) {
      await repos.workflowStep.save({ churchId, workflowId: workflow.id, name: step.name, sort: sort++, expectedResponseDays: step.expectedResponseDays });
    }
    return workflow;
  }

  // --- Scheduled sweeps (called from the timer lambda) ---

  public static async processOverdue(repositories?: Repos): Promise<number> {
    const repos = await this.getRepos(repositories);
    const overdue = (await repos.task.loadOverdueAllChurches()) as Task[];
    for (const card of overdue) {
      await this.notifyAssignee(card, `Card overdue: ${card.title || card.associatedWithLabel || ""}`);
    }
    return overdue.length;
  }

  public static async processSnoozed(repositories?: Repos): Promise<number> {
    const repos = await this.getRepos(repositories);
    const cards = (await repos.task.loadSnoozedDueAllChurches()) as Task[];
    for (const card of cards) {
      card.snoozedUntil = undefined;
      await repos.task.save(card);
      await this.notifyAssignee(card, `Snooze ended: ${card.title || card.associatedWithLabel || ""}`);
    }
    return cards.length;
  }

  // Best-effort in-app notification to the card assignee (person only). No-op if messaging isn't initialized.
  private static async notifyAssignee(task: Task, message: string): Promise<void> {
    if (task.assignedToType !== "person" || !task.assignedToId) return;
    try {
      const { NotificationHelper } = await import("../../messaging/helpers/NotificationHelper.js");
      await NotificationHelper.createNotifications([task.assignedToId], task.churchId || "", "task", task.id || "", message);
    } catch {
      // messaging not available in this process; skip.
    }
  }
}
