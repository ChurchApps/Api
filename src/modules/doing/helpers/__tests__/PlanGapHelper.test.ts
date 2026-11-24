const loadPeople = jest.fn(async (_c: string, ids: string[]) => ids.map((id) => ({ id, displayName: id === "P2" ? "Ann Lee" : "Bo Kim" })));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadPeople }) }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { b1AdminRoot: "https://admin.example.org/" } }));

import { Repos } from "../../repositories/index.js";
import { PlanGapHelper } from "../PlanGapHelper.js";

const positions = [
  { id: "drums", name: "Drums", categoryName: "Band", count: 1 },
  { id: "vocals", name: "Vocals", categoryName: "Band", count: 3 },
  { id: "keys", name: "Keys", categoryName: "Band", count: 1 }
];

const makeRepos = (assignments: { positionId: string; personId: string; status: string }[]) => ({
  plan: { load: jest.fn(async () => ({ id: "PL1", name: "Sunday <AM>", serviceDate: new Date("2026-12-06T12:00:00Z") })) },
  position: { loadByPlanId: jest.fn(async () => positions) },
  assignment: { loadByPlanId: jest.fn(async () => assignments) }
}) as unknown as Repos & { position: { loadByPlanId: jest.Mock }; assignment: { loadByPlanId: jest.Mock } };

describe("PlanGapHelper", () => {
  beforeEach(() => loadPeople.mockClear());

  it("finds unfilled positions (declines don't count) and unconfirmed people, scoped to the church and plan", async () => {
    const repos = makeRepos([
      { positionId: "drums", personId: "P1", status: "Declined" },
      { positionId: "vocals", personId: "P2", status: "Unconfirmed" },
      { positionId: "keys", personId: "P3", status: "Accepted" }
    ]);
    const gaps = await PlanGapHelper.load("CH1", "PL1", repos);
    expect(repos.position.loadByPlanId).toHaveBeenCalledWith("CH1", "PL1");
    expect(repos.assignment.loadByPlanId).toHaveBeenCalledWith("CH1", "PL1");
    expect(gaps.unfilled).toEqual([
      { positionName: "Drums", categoryName: "Band", open: 1 },
      { positionName: "Vocals", categoryName: "Band", open: 2 }
    ]);
    expect(gaps.unconfirmed).toEqual([{ personId: "P2", name: "Ann Lee", positionName: "Vocals" }]);
    expect(PlanGapHelper.hasGaps(gaps)).toBe(true);
    expect(PlanGapHelper.summary("Sunday", gaps)).toBe("Scheduling gaps for Sunday. Unfilled: Drums, Vocals (2). Unconfirmed: Ann Lee");
  });

  it("reports no gaps when every spot is filled and confirmed", async () => {
    const repos = makeRepos([
      { positionId: "drums", personId: "P1", status: "Accepted" },
      { positionId: "vocals", personId: "P2", status: "Accepted" },
      { positionId: "vocals", personId: "P4", status: "Accepted" },
      { positionId: "vocals", personId: "P5", status: "Accepted" },
      { positionId: "keys", personId: "P3", status: "Accepted" }
    ]);
    const gaps = await PlanGapHelper.load("CH1", "PL1", repos);
    expect(PlanGapHelper.hasGaps(gaps)).toBe(false);
    expect(loadPeople).not.toHaveBeenCalled();
    expect(await PlanGapHelper.buildEmails("CH1", "PL1", ["L1"], repos)).toEqual({});
  });

  it("builds one escaped email per leader with a link to the plan in B1Admin", async () => {
    const repos = makeRepos([{ positionId: "vocals", personId: "P2", status: "Unconfirmed" }]);
    const emails = await PlanGapHelper.buildEmails("CH1", "PL1", ["L1", "L2"], repos);
    expect(Object.keys(emails)).toEqual(["L1", "L2"]);
    expect(emails.L1.subject).toBe("Scheduling gaps: Sunday <AM>");
    expect(emails.L1.html).toContain("Sunday &lt;AM&gt;");
    expect(emails.L1.html).toContain("Band: Drums (1 open)");
    expect(emails.L1.html).toContain("Ann Lee (Vocals)");
    expect(emails.L1.html).toContain("href=\"https://admin.example.org/serving/plans/PL1\"");
    expect(emails.L2.html).toBe(emails.L1.html);
  });
});
