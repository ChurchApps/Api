/** Tests auto-scheduling algorithm: rotation, blockouts, max-per-month, household preferences, auto-replacement. */

jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "id" + Math.random().toString(36).slice(2, 8) } }));

const loadGroupMemberPersonIdsMock = jest.fn();
const loadHouseholdPeopleMock = jest.fn().mockResolvedValue([]);
const loadGroupLeaderPersonIdsMock = jest.fn();
const loadPeopleMock = jest.fn();
const loadChurchMock = jest.fn();
jest.mock("../../../../shared/modules/index.js", () => ({
  getMembershipModuleGateway: () => ({
    loadGroupMemberPersonIds: loadGroupMemberPersonIdsMock,
    loadHouseholdPeople: loadHouseholdPeopleMock,
    loadGroupLeaderPersonIds: loadGroupLeaderPersonIdsMock,
    loadPeople: loadPeopleMock,
    loadChurch: loadChurchMock
  })
}));

const notifyMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: notifyMock } }));

jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));

import { PlanHelper, AutofillContext } from "../PlanHelper.js";

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};

const SERVICE_DATE = daysFromNow(7);

function baseContext(overrides: Partial<AutofillContext> = {}): AutofillContext {
  return {
    plan: { id: "plan1", churchId: "c1", serviceDate: SERVICE_DATE },
    positions: [{ id: "pos1", churchId: "c1", planId: "plan1", categoryName: "Band", name: "Vocals", count: 1, groupId: "g1" }],
    assignments: [],
    blockoutDates: [],
    teams: [{ positionId: "pos1", personIds: ["p1", "p2", "p3"] }],
    lastServed: [],
    assignmentsOnSameDate: [],
    ...overrides
  };
}

describe("PlanHelper.computeAssignments", () => {
  it("fills open slots in least-recently-served order, never-served first", () => {
    const ctx = baseContext({
      positions: [{ id: "pos1", churchId: "c1", count: 2 } as any],
      lastServed: [
        { personId: "p1", serviceDate: daysFromNow(-7) },
        { personId: "p2", serviceDate: daysFromNow(-28) }
      ]
    });
    const result = PlanHelper.computeAssignments(ctx);
    expect(result.map((a) => a.personId)).toEqual(["p3", "p2"]);
    expect(result.every((a) => a.status === "Unconfirmed")).toBe(true);
  });

  it("only excludes blockouts that overlap the service date", () => {
    const ctx = baseContext({
      teams: [{ positionId: "pos1", personIds: ["p1", "p2"] }],
      lastServed: [{ personId: "p2", serviceDate: daysFromNow(-7) }],
      blockoutDates: [
        { personId: "p1", startDate: daysFromNow(5), endDate: daysFromNow(9) }, // overlaps -> excluded
        { personId: "p2", startDate: daysFromNow(20), endDate: daysFromNow(22) } // future, no overlap -> eligible
      ]
    });
    const result = PlanHelper.computeAssignments(ctx);
    expect(result.map((a) => a.personId)).toEqual(["p2"]);
  });

  it("excludes people already serving in another plan that day, unless they declined it", () => {
    const ctx = baseContext({
      teams: [{ positionId: "pos1", personIds: ["p1", "p2"] }],
      lastServed: [{ personId: "p2", serviceDate: daysFromNow(-7) }],
      assignmentsOnSameDate: [
        { personId: "p1", positionId: "x1", status: "Accepted" },
        { personId: "p2", positionId: "x2", status: "Declined" }
      ]
    });
    const result = PlanHelper.computeAssignments(ctx);
    expect(result.map((a) => a.personId)).toEqual(["p2"]);
  });

  it("treats a declined slot as unfilled but never re-picks the decliner", () => {
    const ctx = baseContext({
      assignments: [{ id: "a1", positionId: "pos1", personId: "p1", status: "Declined" }],
      lastServed: [
        { personId: "p1", serviceDate: daysFromNow(-60) },
        { personId: "p2", serviceDate: daysFromNow(-30) },
        { personId: "p3", serviceDate: daysFromNow(-7) }
      ]
    });
    const result = PlanHelper.computeAssignments(ctx);
    expect(result.map((a) => a.personId)).toEqual(["p2"]);
  });

  it("skips volunteers already at their max-per-month preference", () => {
    const ctx = baseContext({
      teams: [{ positionId: "pos1", personIds: ["p1", "p2"] }],
      lastServed: [{ personId: "p2", serviceDate: daysFromNow(-7) }],
      preferences: [{ personId: "p1", maxPerMonth: 2 }],
      monthServeCounts: [{ personId: "p1", count: 2 }]
    });
    const result = PlanHelper.computeAssignments(ctx);
    expect(result.map((a) => a.personId)).toEqual(["p2"]);
  });

  it("prefers a volunteer whose preferred time matches over one who mismatches, even if longer-rested", () => {
    const ctx = baseContext({
      teams: [{ positionId: "pos1", personIds: ["p1", "p2"] }],
      times: [{ id: "t1", displayName: "First Service", startTime: new Date(SERVICE_DATE.getTime() + 9 * 3600000) } as any],
      // p2 longer rested but prefers a different time
      lastServed: [{ personId: "p2", serviceDate: daysFromNow(-60) }],
      preferences: [
        { personId: "p1", preferredTimes: "9:00 am" },
        { personId: "p2", preferredTimes: "11:00 am" }
      ]
    });
    const result = PlanHelper.computeAssignments(ctx);
    expect(result.map((a) => a.personId)).toEqual(["p1"]);
  });

  it("treats no time preference the same as a match", () => {
    const ctx = baseContext({
      teams: [{ positionId: "pos1", personIds: ["p1", "p2"] }],
      times: [{ id: "t1", displayName: "First Service" } as any],
      lastServed: [
        { personId: "p1", serviceDate: daysFromNow(-30) },
        { personId: "p2", serviceDate: daysFromNow(-60) }
      ],
      preferences: [{ personId: "p1", preferredTimes: "First Service" }]
    });
    // p2 has no preference and rested longer -> wins on last-served.
    expect(PlanHelper.computeAssignments(ctx).map((a) => a.personId)).toEqual(["p2"]);
  });

  it("household 'apart': won't schedule someone whose household member already serves that day", () => {
    const ctx = baseContext({
      teams: [{ positionId: "pos1", personIds: ["p1", "p2"] }],
      lastServed: [{ personId: "p2", serviceDate: daysFromNow(-7) }],
      assignmentsOnSameDate: [{ personId: "spouse1", positionId: "x1", status: "Accepted" }],
      householdPeople: [
        { id: "p1", householdId: "h1" },
        { id: "spouse1", householdId: "h1" }
      ],
      preferences: [{ personId: "p1", householdScheduling: "apart" }]
    });
    expect(PlanHelper.computeAssignments(ctx).map((a) => a.personId)).toEqual(["p2"]);
  });

  it("household 'together': prefers someone whose household member already serves that day", () => {
    const ctx = baseContext({
      teams: [{ positionId: "pos1", personIds: ["p1", "p2"] }],
      // p1 served recently; p2 never
      lastServed: [{ personId: "p1", serviceDate: daysFromNow(-7) }],
      assignmentsOnSameDate: [{ personId: "spouse1", positionId: "x1", status: "Accepted" }],
      householdPeople: [
        { id: "p1", householdId: "h1" },
        { id: "spouse1", householdId: "h1" }
      ],
      preferences: [{ personId: "p1", householdScheduling: "together" }]
    });
    expect(PlanHelper.computeAssignments(ctx).map((a) => a.personId)).toEqual(["p1"]);
  });

  it("never double-books a person across positions and fills scarce positions first", () => {
    const ctx = baseContext({
      positions: [
        { id: "pos1", churchId: "c1", count: 1 } as any,
        { id: "pos2", churchId: "c1", count: 1 } as any
      ],
      teams: [
        { positionId: "pos1", personIds: ["p1", "p2"] },
        { positionId: "pos2", personIds: ["p1"] } // only p1 can fill pos2
      ]
    });
    const result = PlanHelper.computeAssignments(ctx);
    const byPosition = Object.fromEntries(result.map((a) => [a.positionId, a.personId]));
    expect(byPosition.pos2).toBe("p1");
    expect(byPosition.pos1).toBe("p2");
  });

  it("does not fill positions that are already full", () => {
    const ctx = baseContext({ assignments: [{ id: "a1", positionId: "pos1", personId: "p1", status: "Accepted" }] });
    expect(PlanHelper.computeAssignments(ctx)).toEqual([]);
  });
});

describe("PlanHelper.matchesPreferredTime", () => {
  const times = [{ displayName: "First Service", startTime: new Date(2026, 5, 14, 9, 0) } as any];

  it("returns null with no preference", () => {
    expect(PlanHelper.matchesPreferredTime(undefined, times)).toBeNull();
    expect(PlanHelper.matchesPreferredTime("  ", times)).toBeNull();
  });

  it("matches on display name, case-insensitively", () => {
    expect(PlanHelper.matchesPreferredTime("first service", times)).toBe(true);
  });

  it("matches on start time in several formats", () => {
    expect(PlanHelper.matchesPreferredTime("9:00 am", times)).toBe(true);
    expect(PlanHelper.matchesPreferredTime("9:00", times)).toBe(true);
    expect(PlanHelper.matchesPreferredTime("09:00", times)).toBe(true);
  });

  it("returns false when no token matches", () => {
    expect(PlanHelper.matchesPreferredTime("11:00 am", times)).toBe(false);
  });

  it("matches if any comma-separated token matches", () => {
    expect(PlanHelper.matchesPreferredTime("11:00 am, first", times)).toBe(true);
  });
});

describe("PlanHelper.autofill", () => {
  it("stamps assignments with the run id and records it on the plan for undo", async () => {
    const saved: any[] = [];
    const repos: any = {
      assignment: { save: jest.fn(async (a: any) => { saved.push(a); return a; }) },
      plan: { updateLastAutofillRunId: jest.fn(async () => undefined) }
    };
    const created = await PlanHelper.autofill(baseContext(), "run123", repos);
    expect(created.length).toBe(1);
    expect(saved[0].autofillRunId).toBe("run123");
    expect(repos.plan.updateLastAutofillRunId).toHaveBeenCalledWith("c1", "plan1", "run123");
  });

  it("does not record a run when nothing was assigned", async () => {
    const repos: any = {
      assignment: { save: jest.fn() },
      plan: { updateLastAutofillRunId: jest.fn() }
    };
    const ctx = baseContext({ teams: [{ positionId: "pos1", personIds: [] }] });
    const created = await PlanHelper.autofill(ctx, "run123", repos);
    expect(created).toEqual([]);
    expect(repos.plan.updateLastAutofillRunId).not.toHaveBeenCalled();
  });
});

describe("PlanHelper.autoReplaceDeclined", () => {
  function buildRepos(plan: any, position: any, assignments: any[] = []) {
    const saved: any[] = [];
    const repos: any = {
      position: { load: jest.fn(async () => position) },
      plan: { load: jest.fn(async () => plan) },
      assignment: {
        loadByPlanId: jest.fn(async () => assignments),
        loadLastServed: jest.fn(async () => []),
        loadByServiceDate: jest.fn(async () => []),
        loadMonthServeCounts: jest.fn(async () => []),
        save: jest.fn(async (a: any) => { saved.push(a); return a; })
      },
      blockoutDate: { loadUpcoming: jest.fn(async () => []) },
      time: { loadByPlanId: jest.fn(async () => []) },
      schedulingPreference: { loadByPersonIds: jest.fn(async () => []) }
    };
    return { repos, saved };
  }

  const declined = { id: "a1", churchId: "c1", positionId: "pos1", personId: "p1", status: "Declined" };
  const position = { id: "pos1", churchId: "c1", planId: "plan1", name: "Vocals", count: 1, groupId: "g1" };

  beforeEach(() => {
    jest.clearAllMocks();
    loadGroupMemberPersonIdsMock.mockResolvedValue(["p1", "p2"]);
    loadHouseholdPeopleMock.mockResolvedValue([]);
  });

  it("creates and notifies a replacement, skipping the decliner", async () => {
    const plan = { id: "plan1", churchId: "c1", name: "Sunday", serviceDate: SERVICE_DATE, autoReplaceOnDecline: true };
    const { repos, saved } = buildRepos(plan, position, [declined]);
    const created = await PlanHelper.autoReplaceDeclined("c1", declined as any, repos);
    expect(created.map((a) => a.personId)).toEqual(["p2"]);
    expect(saved[0].status).toBe("Unconfirmed");
    expect(saved[0].notified).toBeInstanceOf(Date);
    expect(notifyMock).toHaveBeenCalledWith(["p2"], "c1", "assignment", "plan1", expect.stringContaining("Vocals"));
  });

  it("does nothing when the plan has not opted in", async () => {
    const plan = { id: "plan1", churchId: "c1", serviceDate: SERVICE_DATE, autoReplaceOnDecline: false };
    const { repos } = buildRepos(plan, position, [declined]);
    expect(await PlanHelper.autoReplaceDeclined("c1", declined as any, repos)).toEqual([]);
  });

  it("does nothing for past plans", async () => {
    const plan = { id: "plan1", churchId: "c1", serviceDate: daysFromNow(-7), autoReplaceOnDecline: true };
    const { repos } = buildRepos(plan, position, [declined]);
    expect(await PlanHelper.autoReplaceDeclined("c1", declined as any, repos)).toEqual([]);
  });

  it("holds the notification when the plan is penciled in (prepared)", async () => {
    const plan = { id: "plan1", churchId: "c1", serviceDate: SERVICE_DATE, autoReplaceOnDecline: true, prepared: true };
    const { repos, saved } = buildRepos(plan, position, [declined]);
    const created = await PlanHelper.autoReplaceDeclined("c1", declined as any, repos);
    expect(created.length).toBe(1);
    expect(notifyMock).not.toHaveBeenCalled();
    expect(saved[0].notified).toBeUndefined();
  });
});

describe("PlanHelper.notifyLeadersOfResponse", () => {
  const position = { id: "pos1", churchId: "c1", planId: "plan1", name: "Usher" };
  const plan = { id: "plan1", churchId: "c1", ministryId: "min1", name: "Sunday AM", serviceDate: SERVICE_DATE };
  const accepted = { id: "a1", churchId: "c1", positionId: "pos1", personId: "vol1", status: "Accepted" };

  const buildRepos = (p: any = plan, pos: any = position) => ({
    position: { load: jest.fn(async () => pos) },
    plan: { load: jest.fn(async () => p) }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    loadGroupLeaderPersonIdsMock.mockResolvedValue(["leader1", "leader2", "vol1"]);
    loadPeopleMock.mockResolvedValue([{ id: "vol1", displayName: "Jane Doe" }]);
    loadChurchMock.mockResolvedValue({ subDomain: "demo", name: "Demo Church" });
  });

  it("alerts the ministry leaders, excluding the responder, with name/role/plan/response", async () => {
    await PlanHelper.notifyLeadersOfResponse("c1", accepted as any, buildRepos() as any);
    expect(loadGroupLeaderPersonIdsMock).toHaveBeenCalledWith("c1", "min1");
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [ids, churchId, contentType, contentId, message] = notifyMock.mock.calls[0];
    expect(ids).toEqual(["leader1", "leader2"]);
    expect(churchId).toBe("c1");
    expect(contentType).toBe("assignment");
    expect(contentId).toBe("plan1");
    expect(message).toContain("Jane Doe");
    expect(message).toContain("accepted");
    expect(message).toContain("Usher");
    expect(message).toContain("Sunday AM");
  });

  it("says 'declined' for a declined response", async () => {
    await PlanHelper.notifyLeadersOfResponse("c1", { ...accepted, status: "Declined" } as any, buildRepos() as any);
    expect(notifyMock.mock.calls[0][4]).toContain("declined");
  });

  it("does nothing when the plan has no ministry", async () => {
    await PlanHelper.notifyLeadersOfResponse("c1", accepted as any, buildRepos({ ...plan, ministryId: undefined }) as any);
    expect(loadGroupLeaderPersonIdsMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("does nothing when the only leader is the responder", async () => {
    loadGroupLeaderPersonIdsMock.mockResolvedValue(["vol1"]);
    await PlanHelper.notifyLeadersOfResponse("c1", accepted as any, buildRepos() as any);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
