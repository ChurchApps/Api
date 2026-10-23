import { DateHelper } from "@churchapps/apihelper";
import { Repos } from "../repositories/index.js";
import { Task, WorkflowStep, WorkflowStepAction } from "../models/index.js";
import { getMembershipModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";
import { UrlValidator } from "../../../shared/webhooks/UrlValidator.js";
import { SafeHttp } from "../../../shared/webhooks/SafeHttp.js";
import { AssignmentWorkflowHelper } from "./AssignmentWorkflowHelper.js";
import { WorkflowHelper } from "./WorkflowHelper.js";

interface HistoryEntry {
  date: string;
  message: string;
}

interface ActionCursor {
  stepId: string;
  index: number;
}

// Runs a step's on-enter actions (best-effort). A "delay" parks the card and saves a
// cursor so processSnoozed can resume the rest after the wait (drip support).
export class StepActionHelper {
  // Returns true when parked (a delay); startIndex resumes after a wake.
  public static async execute(task: Task, step: WorkflowStep, repos: Repos, startIndex = 0, depth = 0): Promise<boolean> {
    const actions = (await repos.workflowStepAction.loadForStep(task.churchId || "", step.id || "")) as WorkflowStepAction[];
    if (task.assignmentId) {
      const data = this.parseData(task);
      for (const [id, state] of Object.entries(data.actionAttempts || {})) {
        if (state === "started") {
          data.actionAttempts[id] = "unknown";
          task.data = JSON.stringify(data);
          this.appendHistory(task, "Previous action outcome unknown; review delivery history before retrying");
          Object.assign(data, this.parseData(task));
        }
      }
      task.data = JSON.stringify(data);
    }
    for (let i = startIndex; i < actions.length; i++) {
      const action = actions[i];
      const config = this.parseConfig(action.config);
      if (await AssignmentWorkflowHelper.stopIfResolved(task, repos)) return true;
      if (task.assignmentId && action.actionType !== "delay") {
        const data = this.parseData(task);
        const key = action.id || `${step.id}:${i}`;
        if (data.actionAttempts?.[key]) continue;
        data.actionAttempts = { ...data.actionAttempts, [key]: "started" };
        data.actionCursor = { stepId: step.id, index: i + 1 };
        task.data = JSON.stringify(data);
        await repos.task.save(task); // checkpoint before side effect, including human task creation
      }
      try {
        switch (action.actionType) {
          case "delay": {
            const days = Number(config.days || 0);
            if (days > 0) {
              task.snoozedUntil = DateHelper.addDays(new Date(), days);
              this.appendHistory(task, `Waiting ${days} day(s)`);
              this.setActionCursor(task, { stepId: step.id || "", index: i + 1 });
              return true;
            }
            break;
          }
          case "addNote":
            this.appendHistory(task, config.note ? `Note: ${config.note}` : "Note added");
            break;
          case "webhook":
            await this.fireWebhook(task, config);
            break;
          case "sendAssignmentRequest":
            await AssignmentWorkflowHelper.send(task, config, repos);
            break;
          case "sendEmail":
            if (task.assignmentId) throw new Error("Use a serving request message for assignment confirmation");
            await this.sendEmail(task, config);
            break;
          case "sendText":
            if (task.assignmentId) throw new Error("Use a serving request message for assignment confirmation");
            await this.sendText(task, config);
            break;
          case "addToGroup":
            await this.addToGroup(task, config);
            break;
          case "removeFromGroup":
            await this.removeFromGroup(task, config);
            break;
          case "addToWorkflow":
            await this.addToWorkflow(task, config, repos, depth);
            break;
          case "setField":
            await this.setField(task, config);
            break;
          case "createTask":
            await this.createTask(task, config, repos);
            break;
          default:
            break;
        }
      } catch (err) {
        const message = (err as Error)?.message || String(err);
        this.appendHistory(task, `Action ${action.actionType} failed: ${message}`);
        console.warn(`[StepActionHelper] action ${action.actionType} failed for card ${task.id || "?"}:`, message);
      }
      if (task.assignmentId && action.actionType !== "delay") {
        const data = this.parseData(task);
        data.actionAttempts[action.id || `${step.id}:${i}`] = "finished";
        task.data = JSON.stringify(data);
        await repos.task.save(task);
      }
    }
    this.clearActionCursor(task);
    return false;
  }

  // The drip cursor lives in task.data alongside history so a woken card can resume.
  public static readActionCursor(task: Task): ActionCursor | null {
    const data = this.parseData(task);
    const c = data.actionCursor;
    return c && typeof c.stepId === "string" && typeof c.index === "number" ? c : null;
  }

  private static setActionCursor(task: Task, cursor: ActionCursor): void {
    const data = this.parseData(task);
    data.actionCursor = cursor;
    task.data = JSON.stringify(data);
  }

  private static clearActionCursor(task: Task): void {
    const data = this.parseData(task);
    if (data.actionCursor === undefined) return;
    delete data.actionCursor;
    task.data = JSON.stringify(data);
  }

  private static parseData(task: Task): any {
    if (!task.data) return {};
    try {
      const parsed = JSON.parse(task.data);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private static parseConfig(config?: string): Record<string, any> {
    if (!config) return {};
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }

  // Action history lives in the card's data JSON so it stays self-contained in the doing module.
  public static appendHistory(task: Task, message: string): void {
    const data = this.parseData(task);
    const history: HistoryEntry[] = Array.isArray(data.history) ? data.history : [];
    history.push({ date: new Date().toISOString(), message });
    data.history = history;
    task.data = JSON.stringify(data);
  }

  private static async fireWebhook(task: Task, config: Record<string, any>): Promise<void> {
    const url = config.url;
    if (!url) return;
    const error = await UrlValidator.validate(url);
    if (error) {
      console.warn(`[StepActionHelper] webhook URL rejected (${error}): ${url}`);
      return;
    }
    await SafeHttp.post(url, { "Content-Type": "application/json" }, JSON.stringify({
      cardId: task.id,
      workflowId: task.workflowId,
      stepId: task.stepId,
      personId: task.associatedWithId,
      personName: task.associatedWithLabel
    }), 10000, 0);
    this.appendHistory(task, "Webhook sent");
  }

  private static async sendEmail(task: Task, config: Record<string, any>): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.templateId) return;
    const membership = getMembershipModuleGateway();
    const person = await membership.loadPerson(task.churchId || "", task.associatedWithId);
    if (!person?.email) return;
    const church = await membership.loadChurch(task.churchId || "");
    const sent = await getMessagingModuleGateway().sendTemplatedEmail(
      task.churchId || "",
      task.associatedWithId,
      config.templateId,
      { email: person.email, firstName: person.firstName, lastName: person.lastName, displayName: person.displayName || task.associatedWithLabel },
      church?.name || "B1",
      config.subject
    );
    if (sent) this.appendHistory(task, "Email sent");
  }

  // Texts the card's person through the church's own provider; failures throw so execute() logs them on the card.
  private static async sendText(task: Task, config: Record<string, any>): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.message?.trim()) return;
    const membership = getMembershipModuleGateway();
    const person = await membership.loadPerson(task.churchId || "", task.associatedWithId);
    const phoneNumber = (person?.mobilePhone || "").trim();
    if (!person) return;
    if (!phoneNumber) {
      this.appendHistory(task, "Text skipped: no mobile phone");
      return;
    }
    if (person.optedOut === true || person.optedOut === 1) {
      this.appendHistory(task, "Text skipped: opted out");
      return;
    }
    const church = await membership.loadChurch(task.churchId || "");
    const recipient = { phoneNumber, firstName: person.firstName, lastName: person.lastName, displayName: person.displayName || task.associatedWithLabel };
    const result = await getMessagingModuleGateway().sendPersonText(task.churchId || "", task.associatedWithId, recipient, config.message, church?.name || "B1");
    if (!result.ok) throw new Error(result.reason || "send failed");
    this.appendHistory(task, "Text sent");
  }

  private static async addToGroup(task: Task, config: Record<string, any>): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.groupId) return;
    await getMembershipModuleGateway().addGroupMember(task.churchId || "", config.groupId, task.associatedWithId);
    this.appendHistory(task, config.groupLabel ? `Added to group: ${config.groupLabel}` : "Added to group");
  }

  private static async removeFromGroup(task: Task, config: Record<string, any>): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.groupId) return;
    await getMembershipModuleGateway().removeGroupMember(task.churchId || "", config.groupId, task.associatedWithId);
    this.appendHistory(task, config.groupLabel ? `Removed from group: ${config.groupLabel}` : "Removed from group");
  }

  // Creates a standalone (non-card) task about the card's person, assigned per config.
  private static async createTask(task: Task, config: Record<string, any>, repos: Repos): Promise<void> {
    if (!config.title) return;
    const child = await repos.task.save({
      churchId: task.churchId,
      assignmentId: task.assignmentId,
      taskType: "FollowUp",
      dateCreated: new Date(),
      associatedWithType: task.associatedWithType,
      associatedWithId: task.associatedWithId,
      associatedWithLabel: task.associatedWithLabel,
      createdByType: "system",
      createdByLabel: "Automation",
      assignedToType: config.assignedToType,
      assignedToId: config.assignedToId,
      assignedToLabel: config.assignedToLabel,
      title: config.title,
      status: "Open",
      dueDate: config.dueDays ? DateHelper.addDays(new Date(), Number(config.dueDays)) : undefined,
      data: JSON.stringify({ description: config.description, assignment: this.parseData(task).assignment, parentCardId: task.id, ...(task.assignmentId ? { history: [{ date: new Date().toISOString(), message: "Created by serving confirmation workflow" }] } : {}) })
    });
    this.appendHistory(task, `Task created: ${config.title} (${child.id || ""})`);
  }

  private static async addToWorkflow(task: Task, config: Record<string, any>, repos: Repos, depth: number): Promise<void> {
    if (task.assignmentId) { this.appendHistory(task, "Workflow handoff skipped: serving confirmation must retain its assignment"); return; }
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.workflowId) return;
    await WorkflowHelper.addToWorkflow(
      task.churchId || "",
      config.workflowId,
      { type: "person", id: task.associatedWithId, label: task.associatedWithLabel },
      { type: "system", label: "System" },
      undefined,
      repos,
      config.stepId,
      depth + 1
    );
    this.appendHistory(task, config.workflowLabel ? `Added to workflow: ${config.workflowLabel}` : "Added to workflow");
  }

  private static async setField(task: Task, config: Record<string, any>): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.field) return;
    await getMembershipModuleGateway().setPersonField(task.churchId || "", task.associatedWithId, config.field, config.value ?? "");
    this.appendHistory(task, `Set ${config.field}`);
  }
}
