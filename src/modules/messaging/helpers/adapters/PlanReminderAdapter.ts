import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { getDoingModuleGateway } from "../../../../shared/modules/DoingModuleGateway.js";
import { singleDateOccurrence } from "../../../../shared/helpers/CivilDate.js";
import { DoingRepos, ForeignPlanRow } from "../ForeignRepos.js";
import { ReminderAdapter, ReminderOccurrenceInfo, ReminderRecipient } from "../ReminderAdapter.js";

// Plan-type-scoped serving reminders with legacy Accept/Decline email buttons.
export const PlanReminderAdapter: ReminderAdapter<ForeignPlanRow> = {
  entityType: "plan",
  category: "serving_schedule",
  contentType: "assignment",

  async loadEntity(churchId: string, entityId: string) {
    const doing = await RepoManager.getRepos<DoingRepos>("doing");
    return (await doing.plan.load(churchId, entityId)) ?? null;
  },

  async loadScopeEntities(churchId: string, scopeId: string, from: Date, to: Date) {
    const doing = await RepoManager.getRepos<DoingRepos>("doing");
    return (await doing.plan.loadByPlanTypeIdInRange(churchId, scopeId, from, to)) || [];
  },

  async getOccurrences(entity: ForeignPlanRow, from: Date, to: Date): Promise<ReminderOccurrenceInfo[]> {
    return singleDateOccurrence(entity.serviceDate, from, to);
  },

  async loadRecipients(churchId: string, entity: ForeignPlanRow): Promise<ReminderRecipient[]> {
    const doing = await RepoManager.getRepos<DoingRepos>("doing");
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

  async buildEmails(entity: ForeignPlanRow, _occLocalISO: string, recipients: ReminderRecipient[], custom?: string) {
    const personIds = recipients.map((r) => r.personId).filter(Boolean);
    if (!entity?.id || personIds.length === 0) return null;
    return getDoingModuleGateway().buildPlanReminderEmails(entity.churchId, entity.id, personIds, custom);
  },

  link(entity: ForeignPlanRow) {
    return entity?.id ? `/mobile/plans/${entity.id}` : "";
  },

  renderMessage(entity: ForeignPlanRow, _occLocalISO: string, custom?: string) {
    const name = entity?.name || "a plan";
    if (custom) return custom.replace(/\{\{planName\}\}/g, name);
    return `Reminder: you're serving at ${name}`;
  }
};
