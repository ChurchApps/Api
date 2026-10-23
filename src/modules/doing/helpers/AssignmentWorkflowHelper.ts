import { Assignment, Plan, Position, Task, Workflow, WorkflowStep } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { getMembershipModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { ScreenScheduleHelper } from "./ScreenScheduleHelper.js";
import { NotificationService } from "../../../shared/helpers/NotificationService.js";
import { WorkflowHelper } from "./WorkflowHelper.js";
import { StepActionHelper } from "./StepActionHelper.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

export class AssignmentWorkflowHelper {
  public static readonly workflowType = "assignmentConfirmation";

  public static data(task: Task): Record<string, any> {
    try { return JSON.parse(task.data || "{}") || {}; } catch { return {}; }
  }

  // Saving, copying, autofilling, and importing do not issue requests. This explicit
  // command binds the workflow before delivery; a timer repairs a failed card start.
  public static async issuePlan(churchId: string, planId: string, repos: Repos): Promise<{ issued: number }> {
    const plan = await repos.plan.load(churchId, planId) as Plan;
    if (!plan || plan.prepared) throw new Error("Publish the plan before issuing requests");
    if (!plan.confirmationWorkflowId) throw new Error("Select a confirmation workflow first");
    await this.validateWorkflow(churchId, plan.confirmationWorkflowId, repos);
    if (await this.expired(churchId, plan, repos)) throw new Error("The response deadline has passed");
    let issued = 0;
    for (const assignment of await repos.assignment.loadByPlanId(churchId, planId) as Assignment[]) {
      if (assignment.status !== "Unconfirmed" || assignment.notified) continue;
      const requested = await repos.assignment.issueConfirmation(churchId, assignment.id, plan.confirmationWorkflowId);
      await this.start(churchId, assignment.id, repos);
      if (requested) issued++;
    }
    return { issued };
  }

  public static async validateWorkflow(churchId: string, workflowId: string, repos: Repos): Promise<void> {
    const workflow = await repos.workflow.load(churchId, workflowId) as Workflow;
    if (!workflow?.active || workflow.workflowType !== this.workflowType) throw new Error("Choose an active assignment confirmation workflow from this church");
    if (!(await repos.workflowStep.loadForWorkflow(churchId, workflowId) as WorkflowStep[]).length) throw new Error("The confirmation workflow needs a step");
  }

  public static async start(churchId: string, assignmentId: string, repos: Repos): Promise<void> {
    await repos.task.withAssignmentLock(churchId, assignmentId, async () => {
      const assignment = await repos.assignment.load(churchId, assignmentId) as Assignment;
      if (!assignment?.confirmationWorkflowId || !assignment.notified) return;
      const existing = await repos.task.loadByFollowupKey(churchId, assignmentId) as Task;
      if (existing) return; // Closed is terminal too; re-issuing cannot re-enroll.
      const position = await repos.position.load(churchId, assignment.positionId) as Position;
      const plan = position ? await repos.plan.load(churchId, position.planId) as Plan : null;
      const steps = await repos.workflowStep.loadForWorkflow(churchId, assignment.confirmationWorkflowId) as WorkflowStep[];
      const person = await getMembershipModuleGateway().loadPerson(churchId, assignment.personId);
      const card: Task = {
        churchId,
        taskType: "card",
        status: "Open",
        dateCreated: new Date(),
        workflowId: assignment.confirmationWorkflowId,
        stepId: steps[0]?.id,
        assignmentId,
        followupKey: assignmentId,
        associatedWithType: "person",
        associatedWithId: assignment.personId,
        associatedWithLabel: (person?.displayName || "Volunteer").slice(0, 45),
        createdByType: "system",
        createdByLabel: "Serving request",
        title: `${person?.displayName || "Volunteer"} · ${position?.name || "Removed role"} · ${plan?.name || "Removed plan"}`.slice(0, 255),
        sort: await repos.task.loadMaxSortForStep(churchId, assignment.confirmationWorkflowId, steps[0]?.id || ""),
        data: JSON.stringify({
          entryPending: true,
          assignment: {
            planId: plan?.id,
            positionId: position?.id,
            personId: assignment.personId,
            planName: plan?.name,
            positionName: position?.name,
            serviceDate: DateHelper.toMysqlDateOnly(plan?.serviceDate)
          }
        })
      };
      await repos.task.save(card);
      if (await this.stopIfResolved(card, repos)) return;
      StepActionHelper.appendHistory(card, "Serving request issued");
      await this.ensureAppAlert(card, repos);
      if (!steps[0]) { await this.close(card, "Workflow step removed", repos); return; }
      await WorkflowHelper.onStepEnter(card, steps[0], repos);
      await repos.task.save(card);
    });
  }

  public static async ensureAppAlert(card: Task, repos: Repos): Promise<void> {
    const data = this.data(card);
    if (data.appAlertAttempted) return;
    data.appAlertAttempted = true;
    card.data = JSON.stringify(data);
    await repos.task.save(card);
    try {
      const context = data.assignment;
      await NotificationService.createNotifications([card.associatedWithId], card.churchId, "assignment", context.planId, `Volunteer Requests: ${context.planName} - ${context.positionName}. Please log in and confirm.`, undefined, undefined, { appOnly: true, category: "serving_schedule" });
      StepActionHelper.appendHistory(card, "App alert requested (confirmation workflow owns email and text)");
    } catch {
      StepActionHelper.appendHistory(card, "App alert failed or outcome unknown; review notification history");
    }
    await repos.task.save(card);
  }

  // Called before every action, wake, route, and human move. Never substitute alert
  // read/delivery state for the assignment response.
  public static async stopIfResolved(task: Task, repos: Repos): Promise<boolean> {
    if (!task.assignmentId) return false;
    if (task.status === "Closed") return true;
    const churchId = task.churchId || "";
    const assignment = await repos.assignment.load(churchId, task.assignmentId) as Assignment;
    const context = this.data(task).assignment;
    const position = assignment ? await repos.position.load(churchId, assignment.positionId) as Position : null;
    const plan = position ? await repos.plan.load(churchId, position.planId) as Plan : null;
    const workflow = task.workflowId ? await repos.workflow.load(churchId, task.workflowId) as Workflow : null;
    let outcome: string;
    if (!assignment || !position || !plan) outcome = "Request removed";
    else if (assignment.personId !== context?.personId || assignment.positionId !== context?.positionId || plan.id !== context?.planId || DateHelper.toMysqlDateOnly(plan.serviceDate) !== DateHelper.toMysqlDateOnly(context?.serviceDate)) outcome = "Request changed";
    else if (assignment.status === "Accepted" || assignment.status === "Declined") outcome = assignment.status;
    else if (assignment.status !== "Unconfirmed") outcome = "Request changed";
    else if (plan.prepared) outcome = "Plan returned to draft";
    else if (await this.expired(churchId, plan, repos, position)) outcome = "Response deadline passed";
    else if (!workflow?.active || workflow.workflowType !== this.workflowType || assignment.confirmationWorkflowId !== task.workflowId || plan.confirmationWorkflowId !== task.workflowId) outcome = "Confirmation workflow disabled or changed";
    if (!outcome) return false;
    await this.close(task, outcome, repos);
    return true;
  }

  // Assigned-volunteer UI policy: latest endTime (or startTime) among times
  // relevant to this position's category. signupDeadlineHours is for self-signup,
  // not assigned responses. With no usable times, expire only this workflow at the
  // end of the church's civil service day so obsolete cases become human exceptions.
  public static async followupDeadline(churchId: string, plan: Plan, repos: Repos, position?: Position): Promise<Date> {
    const times = await repos.time.loadByPlanId(churchId, plan.id);
    const relevant = position ? times.filter((t) => position.categoryName && typeof t.teams === "string" && t.teams.indexOf(position.categoryName) > -1) : times;
    const boundaries = relevant.map((t) => new Date(t.endTime || t.startTime).getTime()).filter(Number.isFinite);
    if (boundaries.length) return new Date(Math.max(...boundaries));
    const church = await getMembershipModuleGateway().loadChurch(churchId);
    const zone = ScreenScheduleHelper.validTimeZone(church?.timeZone);
    const date = DateHelper.toMysqlDateOnly(plan.serviceDate);
    if (!date) return new Date(0);
    const [year, month, day] = date.split("-").map(Number);
    return ScreenScheduleHelper.fromWallClock(new Date(year, month - 1, day + 1), zone);
  }

  private static async expired(churchId: string, plan: Plan, repos: Repos, position?: Position): Promise<boolean> {
    return new Date() >= await this.followupDeadline(churchId, plan, repos, position);
  }

  public static async defaultAssignee(task: Task, repos: Repos): Promise<void> {
    if (task.assignedToId) return;
    const context = this.data(task).assignment || {};
    const plan = await repos.plan.load(task.churchId, context.planId) as Plan;
    const membership = getMembershipModuleGateway();
    const leaders = plan?.ministryId ? await membership.loadGroupLeaderPersonIds(task.churchId, plan.ministryId) : [];
    const leader = leaders[0] ? await membership.loadPerson(task.churchId, leaders[0]) : null;
    task.assignedToType = leader ? "person" : "group";
    task.assignedToId = leader?.id || plan?.ministryId;
    task.assignedToLabel = (leader?.displayName || "Ministry team").slice(0, 45);
  }

  // Completing human work is not a volunteer response. Keep an owned case on
  // the board until the live request resolves or its deadline creates an exception.
  public static async completeHumanFollowup(task: Task, repos: Repos): Promise<Task> {
    if (await this.stopIfResolved(task, repos)) return task;
    const context = this.data(task).assignment;
    const position = await repos.position.load(task.churchId, context.positionId) as Position;
    const plan = await repos.plan.load(task.churchId, context.planId) as Plan;
    const deadline = await this.followupDeadline(task.churchId, plan, repos, position);
    const data = this.data(task);
    if (!data.humanFollowupCompletedAt) {
      data.humanFollowupCompletedAt = new Date().toISOString();
      task.data = JSON.stringify(data);
      StepActionHelper.appendHistory(task, "Human follow-up completed; awaiting assignment response until the follow-up deadline");
    }
    const waiting = this.data(task);
    waiting.entryPending = false;
    delete waiting.actionCursor;
    task.data = JSON.stringify(waiting);
    task.status = "Open";
    task.dueDate = deadline;
    task.snoozedUntil = deadline;
    await this.defaultAssignee(task, repos);
    return repos.task.save(task);
  }

  public static async close(task: Task, outcome: string, repos: Repos): Promise<void> {
    for (const linked of await repos.task.loadForAssignment(task.churchId, task.assignmentId) as Task[]) {
      const target = linked.id === task.id ? task : linked;
      target.status = "Closed";
      target.dateClosed = new Date();
      target.snoozedUntil = null;
      const data = this.data(target);
      delete data.actionCursor;
      data.entryPending = false;
      data.assignmentOutcome = outcome;
      target.data = JSON.stringify(data);
      StepActionHelper.appendHistory(target, `Serving confirmation closed: ${outcome}`);
      await repos.task.save(target);
    }
    if (outcome === "Response deadline passed") {
      const key = `${task.assignmentId}:exception`;
      if (!await repos.task.loadByFollowupKey(task.churchId, key)) {
        const context = this.data(task).assignment || {};
        const assignee = { ...task };
        await this.defaultAssignee(assignee, repos);
        await repos.task.save({
          churchId: task.churchId,
          taskType: "FollowUp",
          status: "Open",
          followupKey: key,
          associatedWithType: "person",
          associatedWithId: task.associatedWithId,
          associatedWithLabel: task.associatedWithLabel,
          createdByType: "system",
          createdByLabel: "Serving confirmation",
          dateCreated: new Date(),
          dueDate: new Date(),
          assignedToType: assignee.assignedToType,
          assignedToId: assignee.assignedToId,
          assignedToLabel: assignee.assignedToLabel,
          title: `Review unanswered serving request: ${task.title}`.slice(0, 255),
          data: JSON.stringify({
            description: "The response deadline passed without an acceptance or decline. Review coverage and record the outcome.",
            assignment: context,
            history: [{ date: new Date().toISOString(), message: "Confirmation expired without a response; leader review required" }]
          })
        });
      }
    }
  }

  // Existing event bus gives prompt termination; the existing 30-minute workflow
  // timer is the repair path for missed events, indirect removals, and starts.
  public static async onEvent(churchId: string, event: string, payload: any): Promise<void> {
    if (!["assignment.updated", "assignment.destroyed", "plan.updated", "plan.destroyed"].includes(event)) return;
    const repos = await RepoManager.getRepos<Repos>("doing");
    if (event.startsWith("assignment.")) {
      await this.reconcileAssignment(churchId, payload.id, repos);
    } else {
      for (const card of await repos.task.loadOpenAssignmentCards(churchId) as Task[]) {
        if (this.data(card).assignment?.planId === payload.id) await this.reconcileAssignment(churchId, card.assignmentId, repos);
      }
    }
  }

  public static async reconcileAssignment(churchId: string, assignmentId: string, repos: Repos): Promise<void> {
    await repos.task.withAssignmentLock(churchId, assignmentId, async () => {
      const card = await repos.task.loadByFollowupKey(churchId, assignmentId) as Task;
      if (card?.status === "Open") await this.stopIfResolved(card, repos);
    });
  }

  public static async processPending(repos: Repos): Promise<number> {
    const issued = await repos.assignment.loadIssuedConfirmations();
    for (const assignment of issued) {
      try { await this.start(assignment.churchId, assignment.id, repos); } catch (err) { console.error("[AssignmentWorkflow] start failed", err); }
    }
    const cards = await repos.task.loadOpenAssignmentCards() as Task[];
    for (const card of cards) {
      try {
        await repos.task.withAssignmentLock(card.churchId, card.assignmentId, async () => {
          const current = await repos.task.load(card.churchId, card.id) as Task;
          if (!current || await this.stopIfResolved(current, repos)) return;
          const due = current.snoozedUntil && new Date(current.snoozedUntil) <= new Date();
          if (!this.data(current).entryPending && due) {
            current.snoozedUntil = null;
            StepActionHelper.appendHistory(current, "Snooze ended");
            await repos.task.save(current);
            if (current.assignedToType === "person" && current.assignedToId) await NotificationService.createNotifications([current.assignedToId], current.churchId, "task", current.id, `Snooze ended: ${current.title || ""}`);
          }
          if (this.data(current).entryPending && (!current.snoozedUntil || due)) {
            const step = await repos.workflowStep.load(current.churchId, current.stepId) as WorkflowStep;
            if (!step) { await this.close(current, "Workflow step removed", repos); return; }
            await this.ensureAppAlert(current, repos);
            await WorkflowHelper.onStepEnter(current, step, repos);
            await repos.task.save(current);
          }
        });
      } catch (err) { console.error("[AssignmentWorkflow] reconciliation failed", err); }
    }
    return cards.length;
  }

  public static async send(task: Task, config: Record<string, any>, repos: Repos): Promise<void> {
    if (!task.assignmentId) { StepActionHelper.appendHistory(task, "Serving message skipped: card has no assignment"); return; }
    const assignment = await repos.assignment.load(task.churchId, task.assignmentId) as Assignment;
    const position = await repos.position.load(task.churchId, assignment.positionId) as Position;
    const plan = await repos.plan.load(task.churchId, position.planId) as Plan;
    const membership = getMembershipModuleGateway();
    const person = await membership.loadPerson(task.churchId, assignment.personId);
    const church = await membership.loadChurch(task.churchId);
    if (!person) { StepActionHelper.appendHistory(task, "Serving message skipped: person removed"); return; }
    const planUrl = `https://${church?.subDomain || "app"}.b1.church/mobile/plans/${plan.id}`;
    const serviceDate = DateHelper.toMysqlDateOnly(plan.serviceDate);
    const summary = `${plan.name} · ${position.name} · ${serviceDate}`;
    const message = (config.message || "Please accept or decline your serving request.")
      .replace(/\{\{planName\}\}/g, plan.name || "").replace(/\{\{positionName\}\}/g, position.name || "").replace(/\{\{serviceDate\}\}/g, serviceDate);
    let links = `<a href="${esc(planUrl)}">View request and respond</a>`;
    const { Environment } = await import("../../../shared/helpers/Environment.js");
    const { ReminderTokenHelper } = await import("./ReminderTokenHelper.js");
    if (Environment.jwtSecret) {
      const exp = await this.followupDeadline(task.churchId, plan, repos, position);
      const url = (action: "accept" | "decline") => `${Environment.doingApi}/assignments/public/respond?token=${ReminderTokenHelper.create(task.assignmentId, task.churchId, action, exp, { personId: assignment.personId, positionId: position.id, planId: plan.id, serviceDate: DateHelper.toMysqlDateOnly(plan.serviceDate) })}`;
      links += ` · <a href="${esc(url("accept"))}">Accept</a> · <a href="${esc(url("decline"))}">Decline</a>`;
    }
    const channel = config.channel === "sms" ? "sms" : "email";
    const result = await getMessagingModuleGateway().sendServingWorkflowMessage(task.churchId, assignment.personId, task.id, channel, person, { subject: `Serving request: ${summary}`, html: `<p>${esc(summary)}</p><p>${esc(message)}</p><p>${links}</p>`, text: `${summary}\n${message}\n${planUrl}` }, church?.name || "B1");
    StepActionHelper.appendHistory(task, `${channel === "sms" ? "Text" : "Email"}: ${result}`);
  }
}
