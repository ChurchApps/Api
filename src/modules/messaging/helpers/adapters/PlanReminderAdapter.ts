import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { getDoingModuleGateway } from "../../../../shared/modules/DoingModuleGateway.js";
import { singleDateOccurrence } from "../../../../shared/helpers/CivilDate.js";
import { ReminderAdapter, ReminderOccurrenceInfo, ReminderRecipient } from "../ReminderAdapter.js";

// Plan-type-scoped serving reminders with legacy Accept/Decline email buttons.
export const PlanReminderAdapter: ReminderAdapter = {
  entityType: "plan",
  category: "serving_schedule",
  contentType: "assignment",

  async loadEntity(churchId: string, entityId: string) {
    const doing = await RepoManager.getRepos<any>("doing");
    return (await doing.plan.load(churchId, entityId)) ?? null;
  },

  async loadScopeEntities(churchId: string, scopeId: string, from: Date, to: Date) {
    const doing = await RepoManager.getRepos<any>("doing");
    return (await doing.plan.loadByPlanTypeIdInRange(churchId, scopeId, from, to)) || [];
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

  async buildEmails(entity: any, _occLocalISO: string, recipients: ReminderRecipient[], custom?: string) {
    const personIds = recipients.map((r) => r.personId).filter(Boolean);
    if (!entity?.id || personIds.length === 0) return null;
    return getDoingModuleGateway().buildPlanReminderEmails(entity.churchId, entity.id, personIds, custom);
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
