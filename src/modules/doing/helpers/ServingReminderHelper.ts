import crypto from "crypto";
import { EmailHelper } from "@churchapps/apihelper";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { getMembershipModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";
import { ReminderTokenHelper } from "./ReminderTokenHelper.js";

// Reminds everyone scheduled (confirmed and unconfirmed) ahead of a plan's service date.
// Always sends a dedicated email AND an in-app/push notification — email is the reach
// channel for reminders, not just an escalation fallback.

const MAX_OFFSET = 7;

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));

export class ServingReminderHelper {
  // Unset = default "2"; empty string = reminders off.
  public static parseOffsets(csv: string | null | undefined): number[] {
    const raw = csv === undefined || csv === null ? "2" : csv;
    const offsets = raw.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_OFFSET);
    return [...new Set(offsets)];
  }

  // Per-(plan, offset, person) dedup fence, shared with the reminder engine via reminderSentLog.
  private static reminderKey(planId: string, daysOut: number, personId: string): string {
    return crypto.createHash("sha256").update(`plan:${planId}:${daysOut}:${personId}`).digest("hex");
  }

  public static async sendReminders(): Promise<{ notifications: number; emails: number }> {
    const repos = await RepoManager.getRepos<any>("doing");
    const plans = (await repos.plan.loadUpcomingForReminders(MAX_OFFSET)) as any[];
    const gateway = getMessagingModuleGateway();

    // Gather offset-matching plans + each assignee's dedup key.
    const pending: { plan: any; assignments: any[]; keyByPerson: Map<string, string> }[] = [];
    for (const plan of plans) {
      try {
        const offsets = this.parseOffsets(plan.reminderOffsets);
        const daysOut = Number(plan.daysOut);
        if (offsets.length === 0 || !offsets.includes(daysOut)) continue;

        const assignments = (await repos.assignment.loadForReminder(plan.churchId, plan.id)) as any[];
        if (assignments.length === 0) continue;

        const keyByPerson = new Map<string, string>();
        for (const a of assignments) {
          if (a.personId && !keyByPerson.has(a.personId)) keyByPerson.set(a.personId, this.reminderKey(plan.id, daysOut, a.personId));
        }
        pending.push({ plan, assignments, keyByPerson });
      } catch (e) {
        console.error(`[ServingReminder] failed for plan ${plan.id}:`, e);
      }
    }

    // One ledger read: which per-person reminders already fired (idempotent, unified with event reminders).
    const allKeys = pending.flatMap((p) => [...p.keyByPerson.values()]);
    const sentKeys = new Set(await gateway.loadSentReminderKeys(allKeys));

    const notifications: any[] = [];
    let emails = 0;
    const ledgerRows: any[] = [];
    for (const { plan, assignments, keyByPerson } of pending) {
      const freshPersonIds = new Set<string>();
      keyByPerson.forEach((k, pid) => { if (!sentKeys.has(k)) freshPersonIds.add(pid); });
      if (freshPersonIds.size === 0) continue;
      try {
        const built = await this.buildForPlan(plan, assignments.filter((a) => freshPersonIds.has(a.personId)));
        notifications.push(...built.notifications);
        emails += built.emails;
        freshPersonIds.forEach((pid) => ledgerRows.push({
          churchId: plan.churchId,
          personId: pid,
          category: "serving_schedule",
          entityType: "plan",
          entityId: plan.id,
          idempotencyKey: keyByPerson.get(pid)
        }));
      } catch (e) {
        console.error(`[ServingReminder] failed for plan ${plan.id}:`, e);
      }
    }

    if (notifications.length > 0) await gateway.createNotifications(notifications);
    if (ledgerRows.length > 0) await gateway.logReminderSends(ledgerRows);
    console.log(`[ServingReminder] ${notifications.length} notifications, ${emails} emails`);
    return { notifications: notifications.length, emails };
  }

  private static async buildForPlan(plan: any, assignments: any[]): Promise<{ notifications: any[]; emails: number }> {
    const membership = getMembershipModuleGateway();
    const church = await membership.loadChurch(plan.churchId);
    const subDomain = church?.subDomain || "app";
    const churchName = church?.name || "B1";
    const planUrl = `https://${subDomain}.b1.church/my/plans?id=${plan.id}`;
    const dateStr = new Date(plan.serviceDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const byPerson = new Map<string, { positions: Set<string>; unconfirmedId: string | null }>();
    for (const a of assignments) {
      if (!a.personId) continue;
      let g = byPerson.get(a.personId);
      if (!g) { g = { positions: new Set(), unconfirmedId: null }; byPerson.set(a.personId, g); }
      if (a.positionName) g.positions.add(a.positionName);
      if (a.status === "Unconfirmed" && !g.unconfirmedId) g.unconfirmedId = a.id;
    }

    const personIds = [...byPerson.keys()];
    const names = new Map<string, string>();
    for (const p of (await membership.loadPeople(plan.churchId, personIds)) as any[]) names.set(p.id, p.displayName);

    const notifications: any[] = [];
    let emails = 0;

    for (const [personId, g] of byPerson) {
      const positions = [...g.positions].join(", ");
      const positionLabel = positions ? ` (${positions})` : "";
      notifications.push({
        churchId: plan.churchId,
        personId,
        contentType: "assignment",
        contentId: plan.id,
        timeSent: new Date(),
        isNew: true,
        message: `Reminder: you're serving${positionLabel} at ${plan.name} on ${dateStr}`,
        link: planUrl
      });

      const person = await membership.loadPerson(plan.churchId, personId);
      if (person?.email) {
        const html = this.buildEmailHtml({
          firstName: (names.get(personId) || "").split(" ")[0] || "there",
          planName: plan.name,
          dateStr,
          positions,
          notes: plan.notes,
          customMessage: plan.reminderMessage,
          planUrl,
          unconfirmedId: g.unconfirmedId,
          churchId: plan.churchId,
          serviceDate: plan.serviceDate
        });
        try {
          await EmailHelper.sendTemplatedEmail(Environment.supportEmail, person.email, churchName, planUrl, `Serving Reminder: ${plan.name}`, html, "ChurchEmailTemplate.html");
          emails++;
        } catch (e) {
          console.error(`[ServingReminder] email failed for ${personId}:`, e);
        }
      }
    }

    return { notifications, emails };
  }

  private static buildEmailHtml(o: {
    firstName: string; planName: string; dateStr: string; positions: string;
    notes?: string; customMessage?: string; planUrl: string;
    unconfirmedId: string | null; churchId: string; serviceDate: any;
  }): string {
    const parts: string[] = [];
    parts.push("<h2>Serving Reminder</h2>");
    parts.push(`<p>Hi ${esc(o.firstName)},</p>`);
    parts.push(`<p>This is a reminder that you're scheduled to serve at <strong>${esc(o.planName)}</strong> on <strong>${esc(o.dateStr)}</strong>.</p>`);
    if (o.positions) parts.push(`<p><strong>Your role(s):</strong> ${esc(o.positions)}</p>`);
    if (o.customMessage) parts.push(`<p>${esc(o.customMessage)}</p>`);
    if (o.notes) parts.push(`<p><em>${esc(o.notes)}</em></p>`);

    if (o.unconfirmedId) {
      // Token expires the day after the service — valid for the whole reminder window.
      const exp = new Date(o.serviceDate); exp.setDate(exp.getDate() + 1);
      const url = (action: "accept" | "decline") =>
        `${Environment.doingApi}/assignments/public/respond?token=${ReminderTokenHelper.create(o.unconfirmedId as string, o.churchId, action, exp)}`;
      parts.push(
        `<p>You haven't responded yet:</p><p>` +
        `<a href="${url("accept")}" style="background:#2e7d32;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;margin-right:8px;">Accept</a>` +
        `<a href="${url("decline")}" style="background:#c62828;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;">Decline</a>` +
        `</p>`
      );
    }

    parts.push(`<p><a href="${o.planUrl}">View your schedule</a></p>`);
    return parts.join("");
  }
}
