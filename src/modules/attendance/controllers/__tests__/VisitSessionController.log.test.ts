import "reflect-metadata";
import type express from "express";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e" } }, Environment: {} }));
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadPeople: jest.fn(async () => []) }) }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("axios", () => ({ post: jest.fn() }));

import { VisitSessionController } from "../VisitSessionController.js";
import type { Session } from "../../models/index.js";

type JsonResult = { obj: unknown; status: number };
const asReq = (r: Partial<express.Request>) => r as express.Request;
const res = {} as express.Response;

function makeController() {
  const repos = { session: { load: jest.fn(async (): Promise<Session | null> => null) }, visit: { loadForSessionPerson: jest.fn() } };
  const au = { churchId: "c1", id: "u1", leaderGroupIds: [] as string[], checkAccess: () => true };
  const controller = Object.assign(new VisitSessionController(), {
    repos,
    actionWrapper: (_req: unknown, _res: unknown, action: (user: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

// Production: one 500 "Cannot read properties of undefined (reading '0')" on POST /attendance/visitsessions/log
// from a body with no visitSessions.
describe("VisitSessionController.log", () => {
  it.each([
    ["no visitSessions", { personId: "p1" }],
    ["an empty visitSessions list", { personId: "p1", visitSessions: [] }],
    ["a visit session without a sessionId", { personId: "p1", visitSessions: [{}] }],
    ["no personId", { visitSessions: [{ sessionId: "s1" }] }]
  ])("answers 400 for %s", async (_name, body) => {
    const { controller, repos } = makeController();
    const result = (await controller.log(asReq({ body }), res)) as JsonResult;
    expect(result.status).toBe(400);
    expect(repos.session.load).not.toHaveBeenCalled();
  });

  it("still answers 404 for an unknown session", async () => {
    const { controller } = makeController();
    const result = (await controller.log(asReq({ body: { personId: "p1", visitSessions: [{ sessionId: "s1" }] } }), res)) as JsonResult;
    expect(result.status).toBe(404);
  });
});
