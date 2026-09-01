// Verifies BaseController.actionWrapperAuth rejects callers with no valid JWT.

jest.mock("@churchapps/apihelper", () => ({
  // Minimal stand-in: actionWrapper invokes the handler with a preset auth user, mirroring
  // what the real one does when the request carries no (or an invalid) token.
  CustomBaseController: class {
    protected _au: any;
    async actionWrapper(_req: any, _res: any, fn: (au: any) => Promise<any>) { return fn(this._au); }
    async actionWrapperAnon(_req: any, _res: any, fn: () => Promise<any>) { return fn(); }
    json(obj: any, statusCode: number) { return { json: obj, statusCode }; }
  },
  AuthenticatedUser: class {}
}));

jest.mock("../KyselyPool.js", () => ({ KyselyPool: { getDb: jest.fn() } }));
jest.mock("../RepoManager.js", () => ({ RepoManager: { getRepos: async () => ({}) } }));

import { BaseController } from "../BaseController.js";

function makeController(au: any) {
  class TestController extends BaseController {
    constructor() { super("commons"); (this as any)._au = au; }
  }
  return new TestController();
}

const req = { headers: {}, socket: {}, params: {}, query: {}, method: "GET", baseUrl: "/commons/assets", path: "/mine", route: { path: "/mine" } } as any;

describe("BaseController.actionWrapperAuth", () => {
  it("401s without running the handler when the principal has no id", async () => {
    const handler = jest.fn(async () => ({ secret: true }));
    const ctrl = makeController({ id: "", checkAccess: () => false });
    const result = await ctrl.actionWrapperAuth(req, {} as any, handler);
    expect(result).toEqual({ json: { errors: ["Sign in required"] }, statusCode: 401 });
    expect(handler).not.toHaveBeenCalled();
  });

  it("runs the handler with the authenticated user when a principal is present", async () => {
    const au = { id: "u1", churchId: "ch1", checkAccess: () => false };
    const handler = jest.fn(async (a: any) => ({ id: a.id }));
    const ctrl = makeController(au);
    expect(await ctrl.actionWrapperAuth(req, {} as any, handler)).toEqual({ id: "u1" });
    expect(handler).toHaveBeenCalledWith(au);
  });
});
