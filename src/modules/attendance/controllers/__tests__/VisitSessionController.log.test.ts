import "reflect-metadata";

jest.mock("../AttendanceBaseController", () => ({ AttendanceBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/index", () => ({ Permissions: { attendance: { edit: "e" } }, Environment: {} }));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("axios", () => ({ post: jest.fn() }));

import { VisitSessionController } from "../VisitSessionController.js";

function makeController() {
  const repos: any = { session: { load: jest.fn(async () => null) }, visit: { loadForSessionPerson: jest.fn() } };
  const au = { churchId: "c1", id: "u1", leaderGroupIds: [], checkAccess: () => true };
  const controller = new VisitSessionController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
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
    const result: any = await (controller as any).log({ body }, {});
    expect(result.status).toBe(400);
    expect(repos.session.load).not.toHaveBeenCalled();
  });

  it("still answers 404 for an unknown session", async () => {
    const { controller } = makeController();
    const result: any = await (controller as any).log({ body: { personId: "p1", visitSessions: [{ sessionId: "s1" }] } }, {});
    expect(result.status).toBe(404);
  });
});
