// Verifies the default-on audit behavior added to BaseController.actionWrapper.

jest.mock("@churchapps/apihelper", () => ({
  // Minimal stand-in: actionWrapper just invokes the handler with a preset auth user,
  // so we exercise BaseController's audit logic without a live HTTP context.
  CustomBaseController: class {
    protected _au: unknown;
    async actionWrapper(_req: unknown, _res: unknown, fn: (au: unknown) => Promise<unknown>) { return fn(this._au); }
    async actionWrapperAnon(_req: unknown, _res: unknown, fn: () => Promise<unknown>) { return fn(); }
  },
  AuthenticatedUser: class {}
}));

jest.mock("../KyselyPool.js", () => ({ KyselyPool: { getDb: jest.fn() } }));

jest.mock("../RepoManager.js", () => ({
  RepoManager: {
    getRepos: async () => ({
      auditLog: {
        create: async (log: Created) => {
          if ((globalThis as AuditGlobals).__auditThrow) throw new Error("db down");
          ((globalThis as AuditGlobals).__auditSink ||= []).push(log);
          return log;
        }
      }
    })
  }
}));

import type { Request, Response } from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { BaseController } from "../BaseController.js";

interface Created { module?: string; entityType?: string; action?: string; entityId?: string; details?: string; churchId?: string; userId?: string; }
type AuditGlobals = typeof globalThis & { __auditSink?: Created[]; __auditThrow?: boolean };

function sink(): Created[] { return (globalThis as AuditGlobals).__auditSink; }

function makeController(moduleName: string, au: Partial<AuthenticatedUser>) {
  class TestController extends BaseController {
    constructor() { super(moduleName); (this as this & { _au: unknown })._au = au; }
  }
  return new TestController();
}

const au = { churchId: "ch1", id: "u1" };
const baseReq = { headers: {}, socket: {}, params: {}, query: {} };
const mockReq = (over: Partial<Request>) => ({ ...baseReq, ...over }) as Request;
const res = {} as Response;

beforeEach(() => {
  (globalThis as AuditGlobals).__auditSink = [];
  (globalThis as AuditGlobals).__auditThrow = false;
});

describe("BaseController audit", () => {
  it("logs a row with module/entityType/details for a POST save", async () => {
    const ctrl = makeController("membership", au);
    const req = mockReq({ method: "POST", baseUrl: "/membership/people", path: "/", route: { path: "/" }, body: [{ id: "p1", firstName: "Alice" }] });
    await ctrl.actionWrapper(req, res, async () => [{ id: "p1" }]);

    expect(sink()).toHaveLength(1);
    expect(sink()[0].module).toBe("membership");
    expect(sink()[0].entityType).toBe("person");
    expect(sink()[0].action).toBe("person_saved");
    expect(sink()[0].entityId).toBe("p1");
    const details = JSON.parse(sink()[0].details as string);
    expect(details.after.firstName).toBe("Alice");
  });

  it("does not log for GET requests", async () => {
    const ctrl = makeController("membership", au);
    const req = mockReq({ method: "GET", baseUrl: "/membership/people", path: "/", route: { path: "/" } });
    await ctrl.actionWrapper(req, res, async () => [{ id: "p1" }]);
    expect(sink()).toHaveLength(0);
  });

  it("does not log opt-out (firehose) routes", async () => {
    const ctrl = makeController("attendance", au);
    const req = mockReq({ method: "POST", baseUrl: "/attendance/visits", path: "/", route: { path: "/" }, body: [{ id: "v1" }] });
    await ctrl.actionWrapper(req, res, async () => [{ id: "v1" }]);
    expect(sink()).toHaveLength(0);
  });

  it.each([
    ["membership", "/membership/people", "/advancedSearch"],
    ["membership", "/membership/people", "/search"],
    ["membership", "/membership/churches", "/search"],
    ["content", "/content/stock", "/search"]
  ])("does not log read-only search POSTs (%s %s%s)", async (moduleName, baseUrl, routePath) => {
    const ctrl = makeController(moduleName, au);
    const req = mockReq({ method: "POST", baseUrl, path: routePath, route: { path: routePath }, body: [{ field: "displayName", operator: "contains", value: "Donald" }] });
    await ctrl.actionWrapper(req, res, async () => [{ id: "p1" }]);
    expect(sink()).toHaveLength(0);
  });

  it("still logs person saves alongside the search opt-outs", async () => {
    const ctrl = makeController("membership", au);
    const req = mockReq({ method: "POST", path: "/membership/people", route: { path: "/membership/people" }, body: [{ id: "p1", firstName: "Alice" }] });
    await ctrl.actionWrapper(req, res, async () => [{ id: "p1" }]);
    expect(sink()).toHaveLength(1);
    expect(sink()[0].action).toBe("person_saved");
  });

  it("returns normally even when the audit insert fails", async () => {
    (globalThis as AuditGlobals).__auditThrow = true;
    const ctrl = makeController("membership", au);
    const req = mockReq({ method: "POST", baseUrl: "/membership/people", path: "/", route: { path: "/" }, body: [{ id: "p1" }] });
    const result = await ctrl.actionWrapper(req, res, async () => [{ id: "p1", ok: true }]);
    expect(result).toEqual([{ id: "p1", ok: true }]);
  });

  it("does not log when the handler returns a 4xx result", async () => {
    const ctrl = makeController("membership", au);
    const req = mockReq({ method: "POST", baseUrl: "/membership/people", path: "/", route: { path: "/" }, body: [{ id: "p1" }] });
    await ctrl.actionWrapper(req, res, async () => ({ json: {}, statusCode: 401 }));
    expect(sink()).toHaveLength(0);
  });

  it("emits one row per touched id on bulk endpoints", async () => {
    const ctrl = makeController("membership", au);
    const req = mockReq({ method: "POST", baseUrl: "/membership/people", path: "/bulk-delete", route: { path: "/bulk-delete" }, body: { personIds: ["p1", "p2"] } });
    await ctrl.actionWrapper(req, res, async () => ({ json: { success: true, deletedIds: ["p1", "p2"], count: 2 }, statusCode: 200 }));
    expect(sink()).toHaveLength(2);
    expect(sink().map((c) => c.entityId)).toEqual(["p1", "p2"]);
    expect(sink().every((c) => c.action === "person_deleted")).toBe(true);
  });

  it("derives module/entityType/action for an unregistered sub-route", async () => {
    const ctrl = makeController("doing", au);
    const req = mockReq({ method: "POST", baseUrl: "/doing/tasks", path: "/t1/move", route: { path: "/:id/move" }, params: { id: "t1" }, body: { position: 3 } });
    await ctrl.actionWrapper(req, res, async () => ({ id: "t1" }));
    expect(sink()).toHaveLength(1);
    expect(sink()[0].module).toBe("doing");
    expect(sink()[0].entityType).toBe("task");
    expect(sink()[0].action).toBe("task_post:/:id/move");
  });

  it("audits anonymous mutations only on sensitive routes and redacts secrets", async () => {
    const ctrl = makeController("giving", au);
    const req = mockReq({ method: "POST", baseUrl: "/giving/donate", path: "/charge", route: { path: "/charge" }, body: { churchId: "ch9", token: "secret-nonce", amount: 25 } });
    await ctrl.actionWrapperAnon(req, res, async () => ({ id: "d1" }));
    expect(sink()).toHaveLength(1);
    expect(sink()[0].userId).toBe("anonymous");
    expect(sink()[0].churchId).toBe("ch9");
    const details = JSON.parse(sink()[0].details as string);
    expect(details.after.token).toBe("[redacted]");
  });

  it("does not audit anonymous mutations on non-sensitive routes", async () => {
    const ctrl = makeController("membership", au);
    const req = mockReq({ method: "POST", baseUrl: "/membership/forms", path: "/public/email", route: { path: "/public/email" }, body: { x: 1 } });
    await ctrl.actionWrapperAnon(req, res, async () => ({ id: "f1" }));
    expect(sink()).toHaveLength(0);
  });
});
