import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Repos } from "../repositories/index.js";
import { Assignment, Plan, Position } from "../models/index.js";

export interface PlanGaps {
  unfilled: { positionName: string; categoryName?: string; open: number }[];
  unconfirmed: { personId: string; name: string; positionName: string }[];
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));

// The leader gap alert: positions still short of their count, and people who haven't answered.
export class PlanGapHelper {
  public static async load(churchId: string, planId: string, repositories?: Repos): Promise<PlanGaps> {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const [positions, assignments] = await Promise.all([
      repos.position.loadByPlanId(churchId, planId) as Promise<Position[]>,
      repos.assignment.loadByPlanId(churchId, planId) as Promise<Assignment[]>
    ]);
    const active = assignments.filter((a) => a.status !== "Declined");
    const positionName = new Map(positions.map((p) => [p.id, p.name || ""]));

    const unfilled = positions
      .map((p) => ({ positionName: p.name || "", categoryName: p.categoryName, open: (p.count || 0) - active.filter((a) => a.positionId === p.id).length }))
      .filter((u) => u.open > 0);

    const waiting = active.filter((a) => a.status === "Unconfirmed" && a.personId && positionName.has(a.positionId));
    const people = waiting.length > 0 ? await getMembershipModuleGateway().loadPeople(churchId, [...new Set(waiting.map((a) => a.personId!))]) : [];
    const names = new Map(people.map((p) => [p.id, p.displayName]));
    const unconfirmed = waiting.map((a) => ({ personId: a.personId!, name: names.get(a.personId!) || "Unknown", positionName: positionName.get(a.positionId) || "" }));

    return { unfilled, unconfirmed };
  }

  public static hasGaps(gaps: PlanGaps): boolean {
    return gaps.unfilled.length > 0 || gaps.unconfirmed.length > 0;
  }

  public static planUrl(planId: string): string {
    return `${(Environment.b1AdminRoot || "").replace(/\/$/, "")}/serving/plans/${planId}`;
  }

  public static summary(planName: string, gaps: PlanGaps): string {
    const parts: string[] = [];
    if (gaps.unfilled.length > 0) parts.push("Unfilled: " + gaps.unfilled.map((u) => (u.open > 1 ? `${u.positionName} (${u.open})` : u.positionName)).join(", "));
    if (gaps.unconfirmed.length > 0) parts.push("Unconfirmed: " + gaps.unconfirmed.map((u) => u.name).join(", "));
    return `Scheduling gaps for ${planName}. ${parts.join(". ")}`;
  }

  // One identical email per leader; empty when the plan has no gaps.
  public static async buildEmails(churchId: string, planId: string, personIds: string[], repositories?: Repos): Promise<Record<string, { subject: string; html: string }>> {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const plan = (await repos.plan.load(churchId, planId)) as Plan;
    if (!plan) return {};
    const gaps = await this.load(churchId, planId, repos);
    if (!this.hasGaps(gaps)) return {};

    const dateStr = plan.serviceDate ? new Date(plan.serviceDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
    const parts: string[] = ["<h2>Scheduling gaps</h2>"];
    parts.push(`<p><strong>${esc(plan.name)}</strong>${dateStr ? ` on <strong>${esc(dateStr)}</strong>` : ""} still has openings.</p>`);
    if (gaps.unfilled.length > 0) {
      parts.push("<p><strong>Unfilled positions</strong></p><ul>");
      gaps.unfilled.forEach((u) => parts.push(`<li>${esc(u.categoryName ? `${u.categoryName}: ${u.positionName}` : u.positionName)} (${u.open} open)</li>`));
      parts.push("</ul>");
    }
    if (gaps.unconfirmed.length > 0) {
      parts.push("<p><strong>Not confirmed yet</strong></p><ul>");
      gaps.unconfirmed.forEach((u) => parts.push(`<li>${esc(u.name)}${u.positionName ? ` (${esc(u.positionName)})` : ""}</li>`));
      parts.push("</ul>");
    }
    parts.push(`<p><a href="${esc(this.planUrl(planId))}">Open the plan</a></p>`);
    const html = parts.join("");

    const out: Record<string, { subject: string; html: string }> = {};
    personIds.forEach((id) => { out[id] = { subject: `Scheduling gaps: ${plan.name}`, html }; });
    return out;
  }
}
