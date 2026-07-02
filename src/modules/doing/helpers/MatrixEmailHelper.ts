import { NotificationService } from "../../../shared/helpers/NotificationService.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

// Consolidated, cross-plan serving summary email: one message per person covering
// every plan they're assigned to in a date range (the matrix "Email all" action).
// Distinct from the reminder engine's per-plan serving reminders (planType-scoped).

const RECIPIENT_CAP = 200;

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));

export interface OverviewEmailRow {
  personId?: string | null;
  planId?: string | null;
  planName?: string | null;
  serviceDate?: Date | string | null;
  positionName?: string | null;
}

export interface PersonSchedule {
  personId: string;
  items: { planName: string; serviceDate: Date | string | null; positions: string[] }[];
}

// Pure: group overview rows into one schedule per person, plans sorted by date,
// roles de-duped. Rows without a personId (unfilled slots) are dropped.
export function groupOverviewByPerson(rows: OverviewEmailRow[]): PersonSchedule[] {
  const byPerson = new Map<string, Map<string, { planName: string; serviceDate: Date | string | null; positions: Set<string> }>>();
  for (const r of rows) {
    if (!r.personId) continue;
    let plans = byPerson.get(r.personId);
    if (!plans) { plans = new Map(); byPerson.set(r.personId, plans); }
    const key = r.planId || `${r.planName}|${r.serviceDate}`;
    let entry = plans.get(key);
    if (!entry) { entry = { planName: r.planName || "", serviceDate: r.serviceDate ?? null, positions: new Set() }; plans.set(key, entry); }
    if (r.positionName) entry.positions.add(r.positionName);
  }
  const toMillis = (d: Date | string | null) => (d ? new Date(d).getTime() : 0);
  return [...byPerson.entries()].map(([personId, plans]) => ({
    personId,
    items: [...plans.values()]
      .sort((a, b) => toMillis(a.serviceDate) - toMillis(b.serviceDate))
      .map((p) => ({ planName: p.planName, serviceDate: p.serviceDate, positions: [...p.positions] }))
  }));
}

function buildHtml(firstName: string, items: PersonSchedule["items"], scheduleUrl: string): string {
  const parts: string[] = [];
  parts.push("<h2>Your Serving Schedule</h2>");
  parts.push(`<p>Hi ${esc(firstName)},</p>`);
  parts.push("<p>Here's a summary of your upcoming serving assignments:</p>");
  parts.push("<ul>");
  for (const it of items) {
    const dateStr = it.serviceDate ? new Date(it.serviceDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
    const roles = it.positions.join(", ");
    parts.push(`<li><strong>${esc(it.planName)}</strong>${dateStr ? ` &mdash; ${esc(dateStr)}` : ""}${roles ? `: ${esc(roles)}` : ""}</li>`);
  }
  parts.push("</ul>");
  parts.push(`<p><a href="${esc(scheduleUrl)}">View your schedule</a></p>`);
  return parts.join("");
}

export class MatrixEmailHelper {
  // Sends one consolidated, preference-gated notification+email per assigned person
  // across the given overview rows; emailImmediate bypasses the unread-dedup guard,
  // so each explicit "Email all" click sends (staff intent), gated per recipient.
  public static async sendConsolidated(churchId: string, rows: OverviewEmailRow[], ministryId: string): Promise<{ sent: number; failed: number; capped: boolean }> {
    const schedules = groupOverviewByPerson(rows);
    const capped = schedules.length > RECIPIENT_CAP;
    const recipients = capped ? schedules.slice(0, RECIPIENT_CAP) : schedules;
    if (recipients.length === 0) return { sent: 0, failed: 0, capped };

    const membership = getMembershipModuleGateway();
    const church = await membership.loadChurch(churchId);
    const subDomain = church?.subDomain || "app";
    const scheduleUrl = `https://${subDomain}.b1.church/my/plans`;

    const names = new Map<string, string>();
    for (const p of (await membership.loadPeople(churchId, recipients.map((r) => r.personId))) as any[]) names.set(p.id, p.displayName);

    const emailByPerson: Record<string, { subject: string; html: string }> = {};
    for (const sched of recipients) {
      const firstName = (names.get(sched.personId) || "").split(" ")[0] || "there";
      emailByPerson[sched.personId] = { subject: "Your Serving Schedule", html: buildHtml(firstName, sched.items, scheduleUrl) };
    }

    const personIds = recipients.map((r) => r.personId);
    const result = await NotificationService.createNotifications(personIds, churchId, "plan", ministryId, "Your serving schedule", scheduleUrl, undefined, {
      category: "serving_schedule",
      deliveryStartLevel: 2,
      emailImmediate: true,
      emailByPerson
    });

    const sent = Array.isArray(result) ? result.length : personIds.length;
    return { sent, failed: 0, capped };
  }
}
