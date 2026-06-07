import { DateHelper } from "@churchapps/apihelper";
import { Repos } from "../repositories/index.js";
import { Task, WorkflowStep, WorkflowStepAction } from "../models/index.js";
import { getMembershipModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";
import { UrlValidator } from "../../../shared/webhooks/UrlValidator.js";
import { WorkflowHelper } from "./WorkflowHelper.js";

interface HistoryEntry {
  date: string;
  message: string;
}

// Runs the automated actions of an "action" step. Each action is best-effort
// (a single failure is logged and skipped, never breaking the card flow). The
// "delay" action is special: it parks the card (snooze) and returns true so the
// caller leaves the card resting on the step until the snooze wakes it.
export class StepActionHelper {
  // Returns true when the card is parked (a delay), false when it should advance.
  public static async execute(task: Task, step: WorkflowStep, repos: Repos): Promise<boolean> {
    const actions = (await repos.workflowStepAction.loadForStep(task.churchId || "", step.id || "")) as WorkflowStepAction[];
    for (const action of actions) {
      const config = this.parseConfig(action.config);
      try {
        switch (action.actionType) {
          case "delay": {
            const days = Number(config.days || 0);
            if (days > 0) {
              task.snoozedUntil = DateHelper.addDays(new Date(), days);
              this.appendHistory(task, `Waiting ${days} day(s)`);
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
          case "sendEmail":
            await this.sendEmail(task, config);
            break;
          case "addToGroup":
            await this.addToGroup(task, config);
            break;
          case "addToWorkflow":
            await this.addToWorkflow(task, config, repos);
            break;
          case "setField":
            await this.setField(task, config);
            break;
          default:
            break;
        }
      } catch (err) {
        console.warn(`[StepActionHelper] action ${action.actionType} failed for card ${task.id || "?"}:`, (err as Error)?.message || err);
      }
    }
    return false;
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
    let data: any = {};
    if (task.data) {
      try {
        data = JSON.parse(task.data);
      } catch {
        data = {};
      }
    }
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
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: task.id,
        workflowId: task.workflowId,
        stepId: task.stepId,
        personId: task.associatedWithId,
        personName: task.associatedWithLabel
      })
    });
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
      config.templateId,
      { email: person.email, displayName: task.associatedWithLabel },
      church?.name || "B1",
      config.subject
    );
    if (sent) this.appendHistory(task, "Email sent");
  }

  private static async addToGroup(task: Task, config: Record<string, any>): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.groupId) return;
    await getMembershipModuleGateway().addGroupMember(task.churchId || "", config.groupId, task.associatedWithId);
    this.appendHistory(task, config.groupLabel ? `Added to group: ${config.groupLabel}` : "Added to group");
  }

  private static async addToWorkflow(task: Task, config: Record<string, any>, repos: Repos): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.workflowId) return;
    await WorkflowHelper.addToWorkflow(
      task.churchId || "",
      config.workflowId,
      { type: "person", id: task.associatedWithId, label: task.associatedWithLabel },
      { type: "system", label: "System" },
      undefined,
      repos,
      config.stepId
    );
    this.appendHistory(task, config.workflowLabel ? `Added to workflow: ${config.workflowLabel}` : "Added to workflow");
  }

  private static async setField(task: Task, config: Record<string, any>): Promise<void> {
    if (task.associatedWithType !== "person" || !task.associatedWithId || !config.field) return;
    await getMembershipModuleGateway().setPersonField(task.churchId || "", task.associatedWithId, config.field, config.value ?? "");
    this.appendHistory(task, `Set ${config.field}`);
  }
}
