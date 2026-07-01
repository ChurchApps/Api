import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";
import { getContentModuleGateway } from "../../../../shared/modules/ContentModuleGateway.js";
import { singleDateOccurrence } from "../../../../shared/helpers/CivilDate.js";
import { ReminderAdapter, ReminderOccurrenceInfo, ReminderRecipient } from "../ReminderAdapter.js";

const ACTIVE_STATUSES = new Set(["pending", "confirmed"]);

const dedup = (recipients: ReminderRecipient[]): ReminderRecipient[] => {
  const seen = new Set<string>();
  const out: ReminderRecipient[] = [];
  for (const r of recipients) {
    if (!r.personId || seen.has(r.personId)) continue;
    seen.add(r.personId);
    out.push(r);
  }
  return out;
};

// Event adapter (architecture §6.3). MVP returns personIds only — the delivery
// path (NotificationHelper) resolves devices/emails itself.
export const EventReminderAdapter: ReminderAdapter = {
  entityType: "event",
  category: "event_reminders",
  contentType: "event",

  async loadEntity(churchId: string, entityId: string) {
    const content = await RepoManager.getRepos<any>("content");
    const event = await content.event.load(churchId, entityId);
    if (!event) return null;
    const exceptions = await content.eventException.loadForEvents(churchId, [entityId]);
    event.exceptionDates = (exceptions || []).map((e: any) => e.exceptionDate);
    return event;
  },

  async getOccurrences(entity: any, from: Date, to: Date): Promise<ReminderOccurrenceInfo[]> {
    // Recurrence expansion stays in content (via the gateway) to respect module boundaries.
    if (entity.recurrenceRule) return getContentModuleGateway().expandEventOccurrences(entity, from, to);
    return singleDateOccurrence(entity.start, from, to);
  },

  async loadRecipients(churchId: string, entity: any, _occLocalISO: string, recipientMode: string): Promise<ReminderRecipient[]> {
    const content = await RepoManager.getRepos<any>("content");
    const eventId = entity.id;

    const groupRecipients = async (): Promise<ReminderRecipient[]> => {
      if (!entity.groupId) return [];
      const membership = await RepoManager.getRepos<any>("membership");
      const rows = await membership.groupMember.loadForGroup(churchId, entity.groupId);
      return (rows || [])
        .filter((r: any) => r.personId && !r.optedOut)
        .map((r: any) => ({ personId: r.personId, email: r.email, mobilePhone: r.mobilePhone, displayName: r.displayName }));
    };

    const activeRegistrations = async () => {
      const regs = (await content.registration.loadForEvent(churchId, eventId)) || [];
      return regs.filter((r: any) => ACTIVE_STATUSES.has(r.status));
    };

    if (recipientMode === "group") return dedup(await groupRecipients());

    if (recipientMode === "registrantsHoh") {
      const regs = await activeRegistrations();
      return dedup(regs.filter((r: any) => r.personId).map((r: any) => ({ personId: r.personId })));
    }

    if (recipientMode === "registrants" || (recipientMode === "auto" && entity.registrationEnabled)) {
      const regs = await activeRegistrations();
      const activeRegIds = new Set(regs.map((r: any) => r.id));
      const members = (await content.registrationMember.loadForEvent(churchId, eventId)) || [];
      const recipients = members
        .filter((m: any) => m.personId && activeRegIds.has(m.registrationId)) // drop free-text (null personId) attendees
        .map((m: any) => ({ personId: m.personId }));
      return dedup(recipients);
    }

    // auto without registration -> group fallback
    return dedup(await groupRecipients());
  },

  link(entity: any) {
    return entity?.id ? `/calendar?eventId=${entity.id}` : "";
  },

  renderMessage(entity: any, _occLocalISO: string, custom?: string) {
    const title = entity?.title || "an event";
    if (custom) return custom.replace(/\{\{eventTitle\}\}/g, title);
    return `Reminder: ${title} is coming up`;
  }
};
