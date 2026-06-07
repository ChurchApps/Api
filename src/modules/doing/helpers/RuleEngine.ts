import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { WorkflowTrigger, Task } from "../models/index.js";
import { ConjunctionHelper } from "./ConjunctionHelper.js";
import { WorkflowHelper } from "./WorkflowHelper.js";
import { EventTriggerHelper } from "./EventTriggerHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

// The single condition->action engine. A "rule" is a workflowTriggers row:
//   - triggerKind="event": reactive (push). Fed by the InternalEventBus; delegated to
//     EventTriggerHelper which evaluates the inline JSON FilterNode against event facts.
//   - triggerKind="schedule": recurring (pull). Run by the cron/timer; evaluates the
//     relational condition tree (conjunctions/conditions owned by triggerId) over the
//     membership people set, then drops matches onto the rule's workflow/step.
// Both paths create a card stamped with triggerId and dedup before creating.
export class RuleEngine {
  // Push path — subscribed to InternalEventBus in initializeDoingModule().
  public static async onEvent(churchId: string, event: string, payload: any): Promise<void> {
    return EventTriggerHelper.onEvent(churchId, event, payload);
  }

  // Pull path — recurring scheduled rules across all churches.
  public static async runScheduled(repositories?: Repos): Promise<void> {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const rules = (await repos.workflowTrigger.loadScheduledAllChurches()) as WorkflowTrigger[];
    for (const rule of rules) {
      try {
        await RuleEngine.runScheduledRule(rule, repos);
      } catch {
        // Skip a failing rule, keep processing the rest.
      }
    }
  }

  private static async runScheduledRule(rule: WorkflowTrigger, repos: Repos): Promise<void> {
    if (!rule.workflowId || !rule.id || !rule.churchId) return;
    const matched = await ConjunctionHelper.getPeopleIdsForTrigger(rule.churchId, rule.id, repos);
    // "*" means "no person-level constraint" — without concrete ids there is no subject to add.
    let peopleIds = matched.filter((id) => id && id !== "*");
    if (peopleIds.length === 0) return;

    // Dedup: drop anyone who already has a card from this rule within the recurs window.
    const existing = (await repos.task.loadByTriggerIdContent(rule.churchId, rule.id, rule.recurs || "", "person", peopleIds)) as Task[];
    if (existing.length > 0) {
      const seen = new Set(existing.map((t) => t.associatedWithId));
      peopleIds = peopleIds.filter((id) => !seen.has(id));
    }
    if (peopleIds.length === 0) return;

    const people: { id: string; displayName: string }[] = await getMembershipModuleGateway().loadPeople(rule.churchId, peopleIds);
    const targets = people.map((p) => ({ type: "person", id: p.id, label: p.displayName }));
    await WorkflowHelper.addPeopleToWorkflow(rule.churchId, rule.workflowId, targets, { type: "system", label: "System" }, rule.id, repos, rule.stepId || undefined);
  }
}
