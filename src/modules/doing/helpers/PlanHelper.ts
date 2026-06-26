import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { NotificationService } from "../../../shared/helpers/NotificationService.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Plan, Position, Assignment, BlockoutDate, SchedulingPreference, Time } from "../models/index.js";

export interface TeamCandidates {
  positionId: string;
  personIds: string[];
}

export interface AutofillContext {
  plan: Plan;
  positions: Position[];
  assignments: Assignment[];
  blockoutDates: BlockoutDate[];
  teams: TeamCandidates[];
  lastServed: { personId: string; serviceDate: Date }[];
  assignmentsOnSameDate?: Assignment[];
  preferences?: SchedulingPreference[];
  monthServeCounts?: { personId: string; count: number }[];
  householdPeople?: { id: string; householdId: string }[];
  times?: Time[];
}

interface NeededPosition {
  position: Position;
  needed: number;
  pool: string[];
}

export class PlanHelper {
  static async autofill(ctx: AutofillContext, runId: string, repositories?: Repos): Promise<Assignment[]> {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const created = this.computeAssignments(ctx);
    if (created.length > 0) {
      created.forEach((a) => (a.autofillRunId = runId));
      await Promise.all(created.map((a) => repos.assignment.save(a)));
      await repos.plan.updateLastAutofillRunId(ctx.plan.churchId, ctx.plan.id, runId);
    }
    return created;
  }

  static computeAssignments(ctx: AutofillContext): Assignment[] {
    const serviceDate = ctx.plan?.serviceDate ? new Date(ctx.plan.serviceDate) : new Date();
    const prefs = new Map<string, SchedulingPreference>();
    (ctx.preferences || []).forEach((p) => prefs.set(p.personId, p));
    const monthCounts = new Map<string, number>();
    (ctx.monthServeCounts || []).forEach((c) => monthCounts.set(c.personId, c.count));
    const lastServed = new Map<string, number>();
    ctx.lastServed.forEach((l) => lastServed.set(l.personId, new Date(l.serviceDate).getTime()));

    const householdOf = new Map<string, string>();
    const householdMembers = new Map<string, string[]>();
    (ctx.householdPeople || []).forEach((p) => {
      if (!p.householdId) return;
      householdOf.set(p.id, p.householdId);
      const list = householdMembers.get(p.householdId) || [];
      list.push(p.id);
      householdMembers.set(p.householdId, list);
    });

    const blocked = new Set<string>();
    ctx.blockoutDates.forEach((b) => {
      const start = new Date(b.startDate);
      const end = new Date(b.endDate);
      end.setHours(23, 59, 59, 999);
      if (start <= serviceDate && serviceDate <= end) blocked.add(b.personId);
    });

    const decliners = new Set<string>();
    const assignedThisPlan = new Set<string>();
    ctx.assignments.forEach((a) => {
      if (a.status === "Declined") decliners.add(a.personId);
      else assignedThisPlan.add(a.personId);
    });

    const busyToday = new Set<string>(assignedThisPlan);
    (ctx.assignmentsOnSameDate || []).forEach((a) => {
      if (a.status !== "Declined") busyToday.add(a.personId);
    });

    const atMonthlyMax = (personId: string) => {
      const max = prefs.get(personId)?.maxPerMonth;
      if (!max) return false;
      return (monthCounts.get(personId) || 0) >= max;
    };

    const neededPositions: NeededPosition[] = [];
    ctx.positions.forEach((p) => {
      const filled = ctx.assignments.filter((a) => a.positionId === p.id && a.status !== "Declined").length;
      const needed = (p.count || 0) - filled;
      if (needed <= 0) return;
      const pool = (ctx.teams.find((t) => t.positionId === p.id)?.personIds || [])
        .filter((id) => !blocked.has(id) && !decliners.has(id) && !busyToday.has(id) && !atMonthlyMax(id));
      neededPositions.push({ position: p, needed, pool });
    });

    // Hardest-to-fill positions first so scarce people land where they're needed most.
    neededPositions.sort((a, b) => a.pool.length - a.needed - (b.pool.length - b.needed));

    const otherHouseholdMembers = (personId: string) => {
      const hh = householdOf.get(personId);
      if (!hh) return [];
      return (householdMembers.get(hh) || []).filter((id) => id !== personId);
    };

    const apartConflict = (personId: string) =>
      otherHouseholdMembers(personId).some((m) =>
        busyToday.has(m) && (prefs.get(personId)?.householdScheduling === "apart" || prefs.get(m)?.householdScheduling === "apart"));

    const togetherBoost = (personId: string) =>
      otherHouseholdMembers(personId).some((m) =>
        busyToday.has(m) && (prefs.get(personId)?.householdScheduling === "together" || prefs.get(m)?.householdScheduling === "together")) ? 1 : 0;

    const prefMatchTier = (personId: string) => (this.matchesPreferredTime(prefs.get(personId)?.preferredTimes, ctx.times || []) === false ? 0 : 1);

    const result: Assignment[] = [];
    neededPositions.forEach((n) => {
      while (n.needed > 0) {
        const eligible = n.pool.filter((id) => !busyToday.has(id) && !apartConflict(id));
        if (eligible.length === 0) break;
        eligible.sort((a, b) => {
          const boost = togetherBoost(b) - togetherBoost(a);
          if (boost !== 0) return boost;
          const tier = prefMatchTier(b) - prefMatchTier(a);
          if (tier !== 0) return tier;
          return (lastServed.get(a) || 0) - (lastServed.get(b) || 0);
        });
        const personId = eligible[0];
        busyToday.add(personId);
        n.needed--;
        result.push({ churchId: n.position.churchId, positionId: n.position.id, personId, status: "Unconfirmed" });
      }
    });

    return result;
  }

  // Fills the declined assignment's position with the next-best candidate when the
  // plan has autoReplaceOnDecline set. Returns the replacement assignments created.
  static async autoReplaceDeclined(churchId: string, declined: Assignment, repositories?: Repos): Promise<Assignment[]> {
    const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
    const position = (await repos.position.load(churchId, declined.positionId)) as Position;
    if (!position?.groupId) return [];
    const plan = (await repos.plan.load(churchId, position.planId)) as Plan;
    if (!plan?.autoReplaceOnDecline) return [];
    const serviceDate = plan.serviceDate ? new Date(plan.serviceDate) : null;
    if (!serviceDate || serviceDate < new Date(new Date().setHours(0, 0, 0, 0))) return [];

    const gateway = getMembershipModuleGateway();
    const memberIds = await gateway.loadGroupMemberPersonIds(churchId, position.groupId);
    if (memberIds.length === 0) return [];

    const assignments = (await repos.assignment.loadByPlanId(churchId, plan.id)) as Assignment[];
    const blockoutDates = (await repos.blockoutDate.loadUpcoming(churchId)) as BlockoutDate[];
    const lastServed = (await repos.assignment.loadLastServed(churchId)) as any[];
    const assignmentsOnSameDate = (await repos.assignment.loadByServiceDate(churchId, serviceDate, plan.id)) as Assignment[];
    const times = (await repos.time.loadByPlanId(churchId, plan.id)) as Time[];
    const preferences = (await repos.schedulingPreference.loadByPersonIds(churchId, memberIds)) as SchedulingPreference[];
    const monthServeCounts = await repos.assignment.loadMonthServeCounts(churchId, serviceDate);
    let householdPeople: { id: string; householdId: string }[] = [];
    try {
      householdPeople = await gateway.loadHouseholdPeople(churchId, memberIds);
    } catch {
      householdPeople = [];
    }

    const created = this.computeAssignments({
      plan,
      positions: [position],
      assignments,
      blockoutDates,
      teams: [{ positionId: position.id, personIds: memberIds }],
      lastServed,
      assignmentsOnSameDate,
      preferences,
      monthServeCounts,
      householdPeople,
      times
    });

    for (const a of created) {
      a.churchId = churchId;
      if (!plan.prepared) {
        try {
          await NotificationService.createNotifications([a.personId], churchId, "assignment", plan.id, `Volunteer Requests: ${plan.name} - ${position.name}. Please log in and confirm.`);
          a.notified = new Date();
        } catch {
          // Notification delivery is best-effort; the assignment still saves.
        }
      }
      await repos.assignment.save(a);
    }
    return created;
  }

  static async notifyLeadersOfResponse(churchId: string, assignment: Assignment, repositories?: Repos): Promise<void> {
    try {
      const repos = repositories || (await RepoManager.getRepos<Repos>("doing"));
      const position = (await repos.position.load(churchId, assignment.positionId)) as Position;
      if (!position) return;
      const plan = (await repos.plan.load(churchId, position.planId)) as Plan;
      if (!plan?.ministryId) return;

      const gateway = getMembershipModuleGateway();
      const leaderIds = (await gateway.loadGroupLeaderPersonIds(churchId, plan.ministryId))
        .filter((id) => id !== assignment.personId);
      if (leaderIds.length === 0) return;

      const [[responder], church] = await Promise.all([
        gateway.loadPeople(churchId, [assignment.personId]),
        gateway.loadChurch(churchId)
      ]);
      const planUrl = `https://${church?.subDomain || "app"}.b1.church/my/plans?id=${plan.id}`;
      const dateStr = plan.serviceDate
        ? new Date(plan.serviceDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
        : "";
      const name = responder?.displayName || "A volunteer";
      const verb = assignment.status === "Accepted" ? "accepted" : "declined";
      const role = position.name ? ` as ${position.name}` : "";
      const message = `${name} ${verb} serving${role} for ${plan.name}${dateStr ? ` on ${dateStr}` : ""}`;

      await NotificationService.createNotifications(leaderIds, churchId, "assignment", plan.id, message, planUrl, assignment.personId);
    } catch (e) {
      console.error("notifyLeadersOfResponse failed:", e);
    }
  }

  // true = a preferred time matches this plan, false = preference set but no match,
  // null = no preference (or no times to compare) — ranks the same as a match.
  static matchesPreferredTime(preferredTimes: string | undefined, times: Time[]): boolean | null {
    const tokens = (preferredTimes || "").split(",").map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
    if (tokens.length === 0 || times.length === 0) return null;
    const candidates: string[] = [];
    times.forEach((t) => {
      if (t.displayName) candidates.push(t.displayName.toLowerCase());
      if (t.startTime) {
        const d = new Date(t.startTime);
        const h24 = d.getHours();
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        const mm = d.getMinutes().toString().padStart(2, "0");
        const ampm = h24 < 12 ? "am" : "pm";
        candidates.push(`${h12}:${mm}`, `${h12}:${mm} ${ampm}`, `${h12}:${mm}${ampm}`, `${h24.toString().padStart(2, "0")}:${mm}`);
      }
    });
    return tokens.some((token) => candidates.some((c) => c.includes(token)));
  }
}
