import "reflect-metadata";
import type express from "express";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e", checkin: "c", view: "v" } } }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("../../helpers/index", () => ({ SecurityCodeHelper: { generate: () => "ABCD" }, CheckinGateHelper: {}, CheckinTimeZoneHelper: {} }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({}) }));

import { VisitController } from "../VisitController.js";
import type { Session, Visit, VisitSession } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController(perms: string[]) {
  const repos = {
    visit: {
      convertAllToModel: (_c: string, rows: Visit[]) => rows,
      loadActiveTodayByPeople: jest.fn(async (_churchId: string, _personIds: string[]): Promise<Visit[]> => [{ id: "v1", personId: "p1", securityCode: "ABCD" }])
    },
    visitSession: {
      convertAllToModel: (_c: string, rows: VisitSession[]) => rows,
      loadByVisitIds: jest.fn(async (): Promise<VisitSession[]> => [{ id: "vs1", visitId: "v1", sessionId: "sess1" }])
    },
    session: {
      convertAllToModel: (_c: string, rows: Session[]) => rows,
      loadByIds: jest.fn(async (): Promise<Session[]> => [{ id: "sess1", groupId: "g1", serviceTimeId: "st1" }])
    }
  };
  const au = { churchId: "c1", id: "u1", checkAccess: (p: string) => perms.includes(p) };
  const controller = Object.assign(new VisitController(), {
    repos,
    actionWrapper: (_req: unknown, _res: unknown, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

// ChurchAppsSupport#1557: staffed check-out finds a household's active visits by name instead of by code.
describe("getActive", () => {
  it("rejects callers without check-in or view access", async () => {
    const { controller, repos } = makeController(["e"]);
    const result = (await controller.getActive(asReq({ query: { peopleIds: "p1" } }), res)) as JsonResult;
    expect(result.status).toBe(401);
    expect(repos.visit.loadActiveTodayByPeople).not.toHaveBeenCalled();
  });

  it("requires peopleIds", async () => {
    const { controller } = makeController(["c"]);
    const result = (await controller.getActive(asReq({ query: {} }), res)) as JsonResult;
    expect(result.status).toBe(400);
  });

  it("returns today's active visits with ids and sessions for the listed people", async () => {
    const { controller, repos } = makeController(["c"]);
    const result = (await controller.getActive(asReq({ query: { peopleIds: "p1, p2,," } }), res)) as Visit[];
    expect(repos.visit.loadActiveTodayByPeople).toHaveBeenCalledWith("c1", ["p1", "p2"]);
    expect(result[0].id).toBe("v1");
    expect(result[0].visitSessions[0].session.groupId).toBe("g1");
  });
});
