import { EmailHelper } from "@churchapps/apihelper";
import { List } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { getDoingModuleGateway, getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Environment } from "./index.js";
import { ListRuleHelper } from "./ListRuleHelper.js";

// Nightly job: re-evaluates auto-refresh lists, diffs against the cached membership,
// runs attached actions for newly added people and notifies the creator on change.
export class ListRefreshHelper {
  public static async refreshAutoLists(): Promise<{ refreshed: number; errors: number }> {
    const repos = await RepoManager.getRepos<Repos>("membership");
    const lists = await repos.list.loadAutoRefresh();
    let refreshed = 0;
    let errors = 0;
    for (const list of lists) {
      try {
        await this.refreshList(repos, list);
        refreshed++;
      } catch (e) {
        errors++;
        console.error(`[ListRefreshHelper] Failed to refresh list ${list.id} (church ${list.churchId}):`, e);
      }
    }
    return { refreshed, errors };
  }

  public static async refreshList(repos: Repos, list: List): Promise<{ added: string[]; removed: string[] }> {
    const currentIds = new Set(await ListRuleHelper.getPeopleIds(list.churchId, list, repos));
    const cachedIds = new Set(await repos.listMember.loadPersonIds(list.churchId, list.id));
    const added = Array.from(currentIds).filter((id) => !cachedIds.has(id));
    const removed = Array.from(cachedIds).filter((id) => !currentIds.has(id));
    await repos.listMember.addPersonIds(list.churchId, list.id, added);
    await repos.listMember.removePersonIds(list.churchId, list.id, removed);
    if (added.length > 0) await this.runActions(repos, list, added);
    if (list.notifyOnChange && (added.length > 0 || removed.length > 0)) await this.notifyCreator(repos, list, added.length, removed.length);
    return { added, removed };
  }

  private static async runActions(repos: Repos, list: List, addedIds: string[]) {
    if (!list.actions || list.actions.length === 0) return;
    const people = (await repos.person.loadByIds(list.churchId, addedIds)) as any[];
    for (const action of list.actions) {
      for (const person of people) {
        try {
          switch (action.type) {
            case "addToGroup":
              if (action.groupId) await getMembershipModuleGateway().addGroupMember(list.churchId, action.groupId, person.id);
              break;
            case "setField":
              if (action.field) await getMembershipModuleGateway().setPersonField(list.churchId, person.id, action.field, action.value ?? "");
              break;
            case "addToWorkflow":
              if (action.workflowId) await getDoingModuleGateway().addPersonToWorkflow(list.churchId, action.workflowId, person.id, person.displayName);
              break;
          }
        } catch (e) {
          console.error(`[ListRefreshHelper] Action ${action.type} failed for person ${person.id} on list ${list.id}:`, e);
        }
      }
    }
  }

  private static async notifyCreator(repos: Repos, list: List, addedCount: number, removedCount: number) {
    if (!list.createdByPersonId) return;
    const creator: any = await repos.person.load(list.churchId, list.createdByPersonId);
    if (!creator?.email) return;
    const subject = `List "${list.name}" membership changed`;
    const contents = `<h2>${list.name}</h2><p>The nightly refresh updated this list: ${addedCount} added, ${removedCount} removed.</p>`;
    try {
      await EmailHelper.sendTemplatedEmail(Environment.supportEmail, creator.email, "B1.church", Environment.b1AdminRoot ?? "", subject, contents, "ChurchEmailTemplate.html");
    } catch (e) {
      console.error(`[ListRefreshHelper] Notification email failed for list ${list.id}:`, e);
    }
  }
}
