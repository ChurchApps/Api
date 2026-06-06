import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Action, Automation, Task } from "../models/index.js";
import { ConjunctionHelper } from "./ConjunctionHelper.js";
import { WorkflowHelper } from "./WorkflowHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

export class AutomationHelper {
  public static async checkAll(repositories?: Repos) {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const automations: Automation[] = (await repos.automation.loadAllChurches()) as Automation[];
    if (automations.length > 0) {
      for (const a of automations) {
        try {
          await AutomationHelper.check(a, repos);
        } catch {
          // Skip automation with error - continue processing others
        }
      }
    }
  }

  public static async check(automation: Automation, repositories?: Repos) {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const triggeredPeopleIds = await ConjunctionHelper.getPeopleIds(automation, repos);
    // if * load all peopele

    if (triggeredPeopleIds.length > 0) {
      const existingTasks: Task[] = await repos.task.loadByAutomationIdContent(automation.churchId || "", automation.id || "", automation.recurs || "", "person", triggeredPeopleIds);
      for (const t of existingTasks) {
        const idx = triggeredPeopleIds.indexOf(t.associatedWithId || "");
        if (idx > -1) triggeredPeopleIds.splice(idx, 1);
      }
    }

    if (triggeredPeopleIds.length > 0) {
      const actions: Action[] = (await repos.action.loadForAutomation(automation.churchId || "", automation.id || "")) as Action[];
      const people: { id: string; displayName: string }[] = await getMembershipModuleGateway().loadPeople(automation.churchId || "", triggeredPeopleIds);
      for (const action of actions) {
        if (action.actionType === "task") {
          await this.createTasks(automation, people, JSON.parse(action.actionData || "{}"), repos);
        } else if (action.actionType === "addToWorkflow") {
          await this.addToWorkflows(automation, people, JSON.parse(action.actionData || "{}"), repos);
        }
      }
    }
  }

  public static async createTasks(
    automation: Automation,
    people: { id: string; displayName: string }[],
    details: { assignedToType?: string; assignedToId?: string; assignedToLabel?: string; title?: string },
    repositories?: Repos
  ) {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const result: Task[] = [];
    for (const p of people) {
      const task: Task = {
        churchId: automation.churchId,
        dateCreated: new Date(),
        associatedWithType: "person",
        associatedWithId: p.id,
        associatedWithLabel: p.displayName,
        createdByType: "system",
        createdByLabel: "System",
        assignedToType: details.assignedToType,
        assignedToId: details.assignedToId,
        assignedToLabel: details.assignedToLabel,
        status: "Open",
        automationId: automation.id,
        title: details.title
      };

      result.push(await repos.task.save(task));
    }
    return result;
  }

  public static async addToWorkflows(
    automation: Automation,
    people: { id: string; displayName: string }[],
    details: { workflowId?: string },
    repositories?: Repos
  ) {
    if (!details.workflowId) return [];
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const targets = people.map((p) => ({ type: "person", id: p.id, label: p.displayName }));
    return await WorkflowHelper.addPeopleToWorkflow(automation.churchId || "", details.workflowId, targets, { type: "system", label: "System" }, automation.id, repos);
  }
}
