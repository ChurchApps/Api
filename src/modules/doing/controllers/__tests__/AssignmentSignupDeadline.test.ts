import "reflect-metadata";

jest.mock("../DoingBaseController", () => ({ DoingBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ PlanAuth: {} }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadChurch: async () => ({ id: "c1", timeZone: "America/Chicago" }) }) }));
jest.mock("../../helpers/PlanHelper", () => ({ PlanHelper: {} }));
jest.mock("../../helpers/ReminderTokenHelper", () => ({ ReminderTokenHelper: {} }));

import { AssignmentController } from "../AssignmentController.js";

function makeController(repos: any) {
  const controller = new AssignmentController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", personId: "p1" });
  return controller;
}

// Issue #1325: the deadline counted back from midnight UTC on the service date, so a
// Sunday 10:00 Central service with a 2-hour deadline closed on Saturday evening.
describe("AssignmentController signup deadline", () => {
  let repos: any;

  beforeEach(() => {
    repos = {
      position: { load: jest.fn(async () => ({ id: "pos1", planId: "plan1", allowSelfSignup: true, count: 3 })) },
      plan: { load: jest.fn(async () => ({ id: "plan1", serviceDate: new Date("2026-10-25"), signupDeadlineHours: 2 })) },
      time: { loadByPlanId: jest.fn(async () => [{ id: "t1", planId: "plan1", startTime: new Date("2026-10-25T15:00:00Z"), serviceTimeType: "service" }]) },
      assignment: {
        countByPositionId: jest.fn(async () => ({ cnt: 0 })),
        loadByPlanId: jest.fn(async () => []),
        load: jest.fn(async () => ({ id: "a1", positionId: "pos1", personId: "p1" })),
        save: jest.fn(async (a: any) => ({ ...a, id: "a1" })),
        delete: jest.fn(async () => undefined)
      }
    };
  });

  afterEach(() => jest.useRealTimers());

  it("lets a volunteer sign up on the service morning before the deadline", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-25T12:00:00Z") });
    const result = await (makeController(repos) as any).signup({ body: { positionId: "pos1" } }, {});
    expect(result).toMatchObject({ id: "a1", positionId: "pos1", status: "Accepted" });
  });

  it("closes signup the given number of hours before the first service time", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-25T13:30:00Z") });
    await expect((makeController(repos) as any).signup({ body: { positionId: "pos1" } }, {})).rejects.toThrow("Signup deadline has passed");
  });

  it("lets a volunteer remove a signup before the deadline", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-25T12:00:00Z") });
    await expect((makeController(repos) as any).signupRemove("a1", { body: null }, {})).resolves.toEqual({});
    expect(repos.assignment.delete).toHaveBeenCalledWith("c1", "a1");
  });
});
