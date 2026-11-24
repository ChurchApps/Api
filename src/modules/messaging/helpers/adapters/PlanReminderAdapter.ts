import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { getDoingModuleGateway } from "../../../../shared/modules/DoingModuleGateway.js";
import { getMembershipModuleGateway } from "../../../../shared/modules/MembershipModuleGateway.js";
import { singleDateOccurrence } from "../../../../shared/helpers/CivilDate.js";
import { DoingRepos, ForeignPlanRow } from "../ForeignRepos.js";
import { ReminderAdapter, ReminderOccurrenceInfo, ReminderRecipient } from "../ReminderAdapter.js";

// Leader gap alert: goes to the leaders of the plan's ministry group, and only when the plan has gaps.
export const LEADER_GAPS_MODE = "leaderGaps";

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

  async loadRecipients(churchId: string, entity: ForeignPlanRow, _occLocalISO: string, recipientMode: string): Promise<ReminderRecipient[]> {
    if (recipientMode === LEADER_GAPS_MODE) {
      if (!entity?.id || !entity.ministryId) return [];
      const summary = await getDoingModuleGateway().loadPlanGapSummary(churchId, entity.id, entity.name || "");
      if (!summary) return [];
      const leaderIds = await getMembershipModuleGateway().loadGroupLeaderPersonIds(churchId, entity.ministryId);
      return [...new Set(leaderIds)].map((personId) => ({ personId }));
    }
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

  async buildEmails(entity: ForeignPlanRow, _occLocalISO: string, recipients: ReminderRecipient[], custom?: string, recipientMode?: string) {
    const personIds = recipients.map((r) => r.personId).filter(Boolean);
    if (!entity?.id || personIds.length === 0) return null;
    if (recipientMode === LEADER_GAPS_MODE) return getDoingModuleGateway().buildPlanGapEmails(entity.churchId, entity.id, personIds);
    return getDoingModuleGateway().buildPlanReminderEmails(entity.churchId, entity.id, personIds, custom);
  },

  link(entity: ForeignPlanRow) {
    return entity?.id ? `/mobile/plans/${entity.id}` : "";
  },

  async renderMessage(entity: ForeignPlanRow, _occLocalISO: string, custom?: string, recipientMode?: string) {
    const name = entity?.name || "a plan";
    if (recipientMode === LEADER_GAPS_MODE) {
      const summary = entity?.id ? await getDoingModuleGateway().loadPlanGapSummary(entity.churchId, entity.id, name) : null;
      return summary || `Scheduling gaps for ${name}`;
    }
    if (custom) return custom.replace(/\{\{planName\}\}/g, name);
    return `Reminder: you're serving at ${name}`;
  }
};
