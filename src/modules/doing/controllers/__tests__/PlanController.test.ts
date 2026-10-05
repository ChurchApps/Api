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
