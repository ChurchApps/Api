import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { WorkflowTrigger } from "../models/index.js";
import { ConditionHelper } from "./ConditionHelper.js";
import { EventTriggerHelper } from "./EventTriggerHelper.js";
import { ExecutionHelper } from "./ExecutionHelper.js";

export class RuleEngine {
  public static async onEvent(churchId: string, event: string, payload: unknown): Promise<void> {
    return EventTriggerHelper.onEvent(churchId, event, payload);
  }

  // nearChurchMidnight (the 30-minute timer): only rules whose church is in the first two hours of its day,
  // so "Today" conditions read the right date; the period dedupe stops the repeat runs adding cards.
  public static async runScheduled(repositories?: Repos, options: { nearChurchMidnight?: boolean } = {}): Promise<{ rules: number; created: number; skipped: number }> {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const rules = (await repos.workflowTrigger.loadScheduledAllChurches()) as WorkflowTrigger[];
    const hours = new Map<string, number>();
    const totals = { rules: 0, created: 0, skipped: 0 };
    for (const rule of rules) {
      try {
        if (options.nearChurchMidnight) {
          const churchId = rule.churchId || "";
          if (!hours.has(churchId)) hours.set(churchId, (await ConditionHelper.churchToday(churchId)).hour);
          if ((hours.get(churchId) ?? 0) >= 2) continue;
        }
        const result = await ExecutionHelper.runScheduledRule(rule, repos);
        totals.rules++;
        totals.created += result.created;
        totals.skipped += result.skipped;
      } catch (err) {
        console.error(`[RuleEngine] scheduled rule ${rule.id} failed:`, err);
      }
    }
    return totals;
  }
}
