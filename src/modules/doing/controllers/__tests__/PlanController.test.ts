import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ PlanAuth: { canEditMinistry: jest.fn(async () => true) } }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: jest.fn() }));
jest.mock("../../../../shared/events/InternalEventBus", () => ({ InternalEventBus: { publish: jest.fn() } }));
jest.mock("../../helpers/PlanHelper", () => ({ PlanHelper: {} }));
jest.mock("../../helpers/MatrixEmailHelper", () => ({ MatrixEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: {} }));

import { PlanController } from "../PlanController.js";

function makeController(repos: any) {
  const controller = new PlanController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1" });
  return controller;
}

describe("PlanController.copy", () => {
  let repos: any;
  let ids: number;
  const withId = async (x: any) => ({ ...x, id: x.id || "new" + (++ids) });

  beforeEach(() => {
    ids = 0;
    repos = {
      plan: { load: jest.fn(async () => ({ id: "old", serviceDate: new Date("2026-09-20") })), save: jest.fn(withId) },
      time: { loadByPlanId: jest.fn(async () => [{ id: "t1", startTime: new Date("2026-09-20T09:00:00"), endTime: new Date("2026-09-20T10:00:00") }]), save: jest.fn(withId) },
      position: { loadByPlanId: jest.fn(async () => [{ id: "pos1", name: "Worship Leader" }]), save: jest.fn(withId) },
      assignment: { loadByPlanId: jest.fn(async () => []), save: jest.fn(withId) },
      planItem: { loadForPlan: jest.fn(async () => [{ id: "pi1", label: "Opening Hymn" }]), save: jest.fn(withId) },
      planItemTime: { loadByPlanId: jest.fn(async () => { throw new Error("Unknown column 'planItemTimes.positionId' in 'field list'"); }), save: jest.fn(withId) }
    };
  });

  // Issue #1121: the new plan is already saved when exclusions are copied, so a failure
  // there must not turn the whole copy into a 500 (the user retries and gets duplicates).
  it("returns the new plan with its service order when copying exclusions fails", async () => {
    const body = { name: "Next Sunday", ministryId: "m1", serviceDate: "2026-09-27", copyMode: "positions", copyServiceOrder: true };
    const result = await (makeController(repos) as any).copy("old", { body }, {});
    expect(result).toMatchObject({ id: "new1", name: "Next Sunday" });
    expect(repos.plan.save).toHaveBeenCalledTimes(1);
    expect(repos.planItem.save).toHaveBeenCalledWith(expect.objectContaining({ label: "Opening Hymn", planId: "new1" }));
  });

  it("carries the previous plan's notes and signup deadline over when the request omits them", async () => {
    repos.plan.load = jest.fn(async () => ({ id: "old", serviceDate: new Date("2026-09-20"), notes: "Bring extra chairs", signupDeadlineHours: 48 }));
    const body = { name: "Next Sunday", ministryId: "m1", serviceDate: "2026-09-27", copyMode: "none", copyServiceOrder: true };
    await (makeController(repos) as any).copy("old", { body }, {});
    expect(repos.plan.save).toHaveBeenCalledWith(expect.objectContaining({ notes: "Bring extra chairs", signupDeadlineHours: 48 }));
  });

  it("keeps notes and signup deadline from the request when it supplies them", async () => {
    repos.plan.load = jest.fn(async () => ({ id: "old", serviceDate: new Date("2026-09-20"), notes: "Old notes", signupDeadlineHours: 48 }));
    const body = { name: "Next Sunday", ministryId: "m1", serviceDate: "2026-09-27", notes: "New notes", signupDeadlineHours: 24, copyMode: "none", copyServiceOrder: true };
    await (makeController(repos) as any).copy("old", { body }, {});
    expect(repos.plan.save).toHaveBeenCalledWith(expect.objectContaining({ notes: "New notes", signupDeadlineHours: 24 }));
  });
});

// Issue #1201: "Show volunteer names on signup page" was saved on the plan but the
// signup page had no way to learn who already signed up for each position.
describe("PlanController.getSignupVolunteers", () => {
  const { getMembershipModuleGateway } = jest.requireMock("../../../../shared/modules/index");
  let repos: any;
  let loadPeople: jest.Mock;

  beforeEach(() => {
    loadPeople = jest.fn(async () => [{ id: "per1", displayName: "Emily Davis" }, { id: "per2", displayName: "Donald Clark" }]);
    getMembershipModuleGateway.mockReturnValue({ loadPeople });
    repos = {
      plan: { load: jest.fn(async () => ({ id: "pla1", showVolunteerNames: true })) },
      position: {
        loadByPlanId: jest.fn(async () => [
          { id: "pos1", planId: "pla1", name: "Coffee Host", allowSelfSignup: true },
          { id: "pos2", planId: "pla1", name: "Greeter", allowSelfSignup: true },
          { id: "pos3", planId: "pla1", name: "Worship Leader", allowSelfSignup: false }
        ])
      },
      assignment: {
        loadByPlanId: jest.fn(async () => [
          { id: "a1", positionId: "pos1", personId: "per1", status: "Accepted" },
          { id: "a2", positionId: "pos2", personId: "per2", status: "Declined" },
          { id: "a3", positionId: "pos3", personId: "per2", status: "Accepted" }
        ])
      }
    };
  });

  it("returns signed-up names per self-signup position when the plan opts in", async () => {
    const result = await (makeController(repos) as any).getSignupVolunteers("pla1", {}, {});
    expect(repos.plan.load).toHaveBeenCalledWith("c1", "pla1");
    expect(result).toEqual([{ positionId: "pos1", names: ["Emily Davis"] }, { positionId: "pos2", names: [] }]);
  });

  it("returns nothing when the plan has volunteer names turned off", async () => {
    repos.plan.load = jest.fn(async () => ({ id: "pla1", showVolunteerNames: false }));
    const result = await (makeController(repos) as any).getSignupVolunteers("pla1", {}, {});
    expect(result).toEqual([]);
    expect(loadPeople).not.toHaveBeenCalled();
  });

  it("returns nothing for a plan outside the caller's church", async () => {
    repos.plan.load = jest.fn(async () => null);
    const result = await (makeController(repos) as any).getSignupVolunteers("pla1", {}, {});
    expect(result).toEqual([]);
  });
});
