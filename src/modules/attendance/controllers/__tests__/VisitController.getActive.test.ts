import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../helpers/index", () => ({ SecurityCodeHelper: { generate: () => "ABCD" }, CheckinGateHelper: {}, CheckinTimeZoneHelper: {} }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));

import { VisitController } from "../VisitController.js";

function makeController(perms: string[]) {
  const repos: any = {
    visit: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      loadActiveTodayByPeople: jest.fn(async () => [{ id: "v1", personId: "p1", securityCode: "ABCD" }])
    },
    visitSession: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      loadByVisitIds: jest.fn(async () => [{ id: "vs1", visitId: "v1", sessionId: "sess1" }])
    },
    session: {
      convertAllToModel: (_c: string, rows: any[]) => rows,
      loadByIds: jest.fn(async () => [{ id: "sess1", groupId: "g1", serviceTimeId: "st1" }])
    }
  };
  const au = { churchId: "c1", id: "u1", checkAccess: (p: string) => perms.includes(p) };
  const controller = new VisitController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller: controller as any, repos };
}

// ChurchAppsSupport#1557: staffed check-out finds a household's active visits by name instead of by code.
describe("getActive", () => {
  it("rejects callers without check-in or view access", async () => {
    const { controller, repos } = makeController(["e"]);
    const result = await controller.getActive({ query: { peopleIds: "p1" } }, {});
    expect(result.status).toBe(401);
    expect(repos.visit.loadActiveTodayByPeople).not.toHaveBeenCalled();
  });

  it("requires peopleIds", async () => {
    const { controller } = makeController(["c"]);
    const result = await controller.getActive({ query: {} }, {});
    expect(result.status).toBe(400);
  });

  it("returns today's active visits with ids and sessions for the listed people", async () => {
    const { controller, repos } = makeController(["c"]);
    const result = await controller.getActive({ query: { peopleIds: "p1, p2,," } }, {});
    expect(repos.visit.loadActiveTodayByPeople).toHaveBeenCalledWith("c1", ["p1", "p2"]);
    expect(result[0].id).toBe("v1");
    expect(result[0].visitSessions[0].session.groupId).toBe("g1");
  });
});
