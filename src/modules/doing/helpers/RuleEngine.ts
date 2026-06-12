import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { WorkflowTrigger } from "../models/index.js";
import { EventTriggerHelper } from "./EventTriggerHelper.js";
import { ExecutionHelper } from "./ExecutionHelper.js";

// The single condition->action engine. A "rule" is a workflowTriggers row:
//   - triggerKind="event": reactive (push). Fed by the InternalEventBus; delegated to
//     EventTriggerHelper which evaluates the inline JSON FilterNode against event facts.
//   - triggerKind="schedule": recurring (pull). Run by the cron/timer; evaluates the
//     relational condition tree (conjunctions/conditions owned by triggerId) over the
//     membership people set, then drops matches onto the rule's workflow/step.
// Both paths create a card stamped with triggerId and dedup before creating; every
// firing is recorded as an automationExecutions row (history + retry).
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
        await ExecutionHelper.runScheduledRule(rule, repos);
      } catch {
        // Skip a failing rule, keep processing the rest.
      }
    }
  }
}
