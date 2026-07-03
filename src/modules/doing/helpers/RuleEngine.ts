import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { WorkflowTrigger } from "../models/index.js";
import { EventTriggerHelper } from "./EventTriggerHelper.js";
import { ExecutionHelper } from "./ExecutionHelper.js";

export class RuleEngine {
  public static async onEvent(churchId: string, event: string, payload: any): Promise<void> {
    return EventTriggerHelper.onEvent(churchId, event, payload);
  }

  public static async runScheduled(repositories?: Repos): Promise<void> {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const rules = (await repos.workflowTrigger.loadScheduledAllChurches()) as WorkflowTrigger[];
    for (const rule of rules) {
      try {
        await ExecutionHelper.runScheduledRule(rule, repos);
      } catch {
      }
    }
  }
}
