const getReposMock = jest.fn() as jest.MockedFunction<any>;
jest.mock("../../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: (...a: any[]) => getReposMock(...a) } }));

const buildPlanReminderEmails = jest.fn(async () => ({ P1: { subject: "s", html: "h" } }));
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: () => ({ buildPlanReminderEmails }) }));

import { PlanReminderAdapter } from "../adapters/PlanReminderAdapter.js";

describe("PlanReminderAdapter.loadScopeEntities", () => {
  it("queries the doing repo for plans of the planType inside the window", async () => {
    const loadByPlanTypeIdInRange = jest.fn(async () => [{ id: "PL1" }, { id: "PL2" }]);
    getReposMock.mockResolvedValue({ plan: { loadByPlanTypeIdInRange } });
    const from = new Date("2026-12-01T00:00:00Z");
    const to = new Date("2026-12-15T00:00:00Z");
    const res = await PlanReminderAdapter.loadScopeEntities!("CH1", "PT1", from, to);
    expect(loadByPlanTypeIdInRange).toHaveBeenCalledWith("CH1", "PT1", from, to);
    expect(res).toEqual([{ id: "PL1" }, { id: "PL2" }]);
  });
});

describe("PlanReminderAdapter.buildEmails", () => {
  beforeEach(() => buildPlanReminderEmails.mockClear());

  it("delegates to the doing gateway with the plan's church, plan id, personIds and custom message", async () => {
    const res = await PlanReminderAdapter.buildEmails!(
      { id: "PLAN1", churchId: "CH1" },
      "2026-12-10T10:00:00",
      [{ personId: "P1" }, { personId: "P2" }],
      "Arrive 30 min early"
    );
    expect(buildPlanReminderEmails).toHaveBeenCalledWith("CH1", "PLAN1", ["P1", "P2"], "Arrive 30 min early");
    expect(res).toEqual({ P1: { subject: "s", html: "h" } });
  });

  it("returns null (no gateway call) when there are no recipients", async () => {
    const res = await PlanReminderAdapter.buildEmails!({ id: "PLAN1", churchId: "CH1" }, "iso", [], undefined);
    expect(res).toBeNull();
    expect(buildPlanReminderEmails).not.toHaveBeenCalled();
  });
});
