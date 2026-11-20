// Verifies BaseController.actionWrapperAuth rejects callers with no valid JWT.

jest.mock("@churchapps/apihelper", () => ({
  // Minimal stand-in: actionWrapper invokes the handler with a preset auth user, mirroring
  // what the real one does when the request carries no (or an invalid) token.
  CustomBaseController: class {
    protected _au: unknown;
    async actionWrapper(_req: unknown, _res: unknown, fn: (au: unknown) => Promise<unknown>) { return fn(this._au); }
    async actionWrapperAnon(_req: unknown, _res: unknown, fn: () => Promise<unknown>) { return fn(); }
    json(obj: unknown, statusCode: number) { return { json: obj, statusCode }; }
  },
  AuthenticatedUser: class {}
}));

jest.mock("../KyselyPool.js", () => ({ KyselyPool: { getDb: jest.fn() } }));
jest.mock("../RepoManager.js", () => ({ RepoManager: { getRepos: async () => ({}) } }));

import type { Request, Response } from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { BaseController } from "../BaseController.js";

function makeController(au: Partial<AuthenticatedUser>) {
  class TestController extends BaseController {
    constructor() { super("commons"); (this as this & { _au: unknown })._au = au; }
  }
  return new TestController();
}

const req = { headers: {}, socket: {}, params: {}, query: {}, method: "GET", baseUrl: "/commons/assets", path: "/mine", route: { path: "/mine" } } as Request;
const res = {} as Response;

describe("BaseController.actionWrapperAuth", () => {
  it("401s without running the handler when the principal has no id", async () => {
    const handler = jest.fn(async () => ({ secret: true }));
    const ctrl = makeController({ id: "", checkAccess: () => false });
    const result = await ctrl.actionWrapperAuth(req, res, handler);
    expect(result).toEqual({ json: { errors: ["Sign in required"] }, statusCode: 401 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler with the authenticated user when a principal is present", async () => {
    const au = { id: "u1", churchId: "ch1", checkAccess: () => false };
    const handler = jest.fn(async (a: AuthenticatedUser) => ({ id: a.id }));
    const ctrl = makeController(au);
    expect(await ctrl.actionWrapperAuth(req, res, handler)).toEqual({ id: "u1" });
    expect(handler).toHaveBeenCalledWith(au);
  });
});
