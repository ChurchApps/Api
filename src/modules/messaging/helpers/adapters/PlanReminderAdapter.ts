import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { singleDateOccurrence } from "../../../../shared/helpers/CivilDate.js";
import { ReminderAdapter, ReminderOccurrenceInfo, ReminderRecipient } from "../ReminderAdapter.js";

// Plan adapter (architecture §6.3). Wraps the proven AssignmentRepo.loadForReminder
// recipient logic. NOTE: the existing midnight ServingReminderHelper is left
// running and is NOT migrated here — this adapter only fires for explicit
// reminderDefinitions(entityType='plan'), so there is no double-send.
export const PlanReminderAdapter: ReminderAdapter = {
  entityType: "plan",
  category: "serving_schedule",
  contentType: "assignment",

  async loadEntity(churchId: string, entityId: string) {
    const doing = await RepoManager.getRepos<any>("doing");
    return (await doing.plan.load(churchId, entityId)) ?? null;
  },

  async getOccurrences(entity: any, from: Date, to: Date): Promise<ReminderOccurrenceInfo[]> {
    return singleDateOccurrence(entity.serviceDate, from, to);
  },

  async loadRecipients(churchId: string, entity: any): Promise<ReminderRecipient[]> {
    const doing = await RepoManager.getRepos<any>("doing");
    const assignments = (await doing.assignment.loadForReminder(churchId, entity.id)) || []; // Accepted + Unconfirmed
    const seen = new Set<string>();
    const out: ReminderRecipient[] = [];
    for (const a of assignments) {
      if (!a.personId || seen.has(a.personId)) continue;
      seen.add(a.personId);
      out.push({ personId: a.personId });
    }
    return out;
  },

  link(entity: any) {
    return entity?.id ? `/my/plans?id=${entity.id}` : "";
  },

  renderMessage(entity: any, _occLocalISO: string, custom?: string) {
    const name = entity?.name || "a plan";
    if (custom) return custom.replace(/\{\{planName\}\}/g, name);
    return `Reminder: you're serving at ${name}`;
  }
};
