import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { ReminderTokenHelper } from "./ReminderTokenHelper.js";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));

export class PlanReminderEmailHelper {
  public static async build(churchId: string, planId: string, personIds: string[], customMessage?: string): Promise<Record<string, { subject: string; html: string }>> {
    const repos = await RepoManager.getRepos<any>("doing");
    const plan = await repos.plan.load(churchId, planId);
    if (!plan) return {};

    const membership = getMembershipModuleGateway();
    const church = await membership.loadChurch(churchId);
    const subDomain = church?.subDomain || "app";
    const planUrl = `https://${subDomain}.b1.church/my/plans?id=${plan.id}`;
    const dateStr = new Date(plan.serviceDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const wanted = new Set(personIds);
    const assignments = (await repos.assignment.loadForReminder(churchId, planId)) as any[];
    const byPerson = new Map<string, { positions: Set<string>; unconfirmedId: string | null }>();
    for (const a of assignments) {
      if (!a.personId || !wanted.has(a.personId)) continue;
      let g = byPerson.get(a.personId);
      if (!g) { g = { positions: new Set(), unconfirmedId: null }; byPerson.set(a.personId, g); }
      if (a.positionName) g.positions.add(a.positionName);
      if (a.status === "Unconfirmed" && !g.unconfirmedId) g.unconfirmedId = a.id;
    }

    const names = new Map<string, string>();
    for (const p of (await membership.loadPeople(churchId, [...byPerson.keys()])) as any[]) names.set(p.id, p.displayName);

    const out: Record<string, { subject: string; html: string }> = {};
    for (const [personId, g] of byPerson) {
      const html = this.buildEmailHtml({
        firstName: (names.get(personId) || "").split(" ")[0] || "there",
        planName: plan.name,
        dateStr,
        positions: [...g.positions].join(", "),
        notes: plan.notes,
        customMessage,
        planUrl,
        unconfirmedId: g.unconfirmedId,
        churchId,
        serviceDate: plan.serviceDate
      });
      out[personId] = { subject: `Serving Reminder: ${plan.name}`, html };
    }
    return out;
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
