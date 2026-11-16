import "reflect-metadata";

// express-validator is real here: the defect is in what the route's sanitizers do to the typed address.
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("bcryptjs", () => {
  const compare = jest.fn(async () => true);
  const hashSync = jest.fn(() => "hashed");
  return { __esModule: true, default: { compare, hashSync, compareSync: jest.fn() }, compare, hashSync };
});
jest.mock("../../auth/index", () => ({ AuthenticatedUser: { login: jest.fn(), loadUserByJwt: jest.fn() } }));
jest.mock("../../helpers/index", () => {
  const { LoginRateLimiter } = require("../../helpers/LoginRateLimiter");
  return {
    LoginRateLimiter,
    PublicPersonRateLimiter: { allow: jest.fn(async () => true) },
    AuthGuidHelper: { mint: () => ({ raw: "raw-guid", stored: "stored-guid" }) },
    UserHelper: { sendForgotEmail: jest.fn(async () => {}) },
    UserChurchHelper: {},
    UniqueIdHelper: { shortId: () => "tmp" },
    Environment: { currentEnvironment: "test", isMailConfigured: true },
    Permissions: { server: { admin: "serverAdmin" } },
    AuditLogHelper: { getClientIp: jest.fn(() => "1.1.1.1"), log: jest.fn() },
    MauticHelper: {},
    ChurchHelper: {}
  };
});
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: () => null, getAll: () => [] } }));

import { METADATA_KEY } from "inversify-express-utils";
import { UserController } from "../UserController.js";
import { UserHelper } from "../../helpers/index.js";

// Accounts created by a staff invite or Google/Microsoft sign-in keep the address as typed.
function controllerWithUser(storedEmail: string) {
  const stored = { id: "u1", email: storedEmail, verificationCode: "hash", verificationExpires: new Date(Date.now() + 60000) };
  const repos: any = {
    user: {
      loadByEmail: jest.fn(async (email: string) => (email === storedEmail ? stored : null)),
      save: jest.fn(async (u: any) => u),
      updateVerification: jest.fn(async () => {}),
      incrementVerificationAttempts: jest.fn(async () => 1),
      clearVerification: jest.fn(async () => {})
    },
    loginAttempt: { loadCount: jest.fn(async () => 0), increment: jest.fn(async () => {}), clear: jest.fn(async () => {}) }
  };
  const controller = new UserController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).error = (errors: string[]) => ({ obj: { errors }, status: 500 });
  return { controller, repos };
}

// Runs the route's express-validator chain on the body, then the handler, like the router does.
async function callRoute(controller: any, method: string, body: any) {
  const routes: any[] = Reflect.getMetadata(METADATA_KEY.controllerMethod, UserController);
  const route = routes.find((r) => r.key === method);
  const req: any = { body: { ...body }, headers: {}, socket: { remoteAddress: "1.1.1.1" } };
  for (const mw of route.middleware) await mw.run(req);
  return controller[method](req, {});
}

describe("password reset looks up the account by the address as typed", () => {
  beforeEach(() => (UserHelper.sendForgotEmail as jest.Mock).mockClear());

  it.each(["jane+church@gmail.com", "jane@googlemail.com", "bob+b1@outlook.com"])("emails a reset code to %s", async (email) => {
    const { controller } = controllerWithUser(email);
    const result = await callRoute(controller, "forgotPassword", { userEmail: email });
    expect(result).toEqual({ obj: { emailed: true }, status: 200 });
    expect(UserHelper.sendForgotEmail).toHaveBeenCalledWith(email, expect.any(String), undefined, undefined);
  });

  it("accepts the code for a plus-tagged address", async () => {
    const { controller } = controllerWithUser("jane+church@gmail.com");
    const result = await callRoute(controller, "verifyCode", { email: "jane+church@gmail.com", code: "123456" });
    expect(result).toEqual({ obj: { authGuid: "raw-guid" }, status: 200 });
  });

  it("reports a plus-tagged address as existing", async () => {
    const { controller } = controllerWithUser("jane+church@gmail.com");
    const result = await callRoute(controller, "checkEmail", { email: "Jane+Church@gmail.com" });
    expect(result).toEqual({ obj: { exists: true, peopleMatches: [] }, status: 200 });
  });

  it("still finds a canonical account when the member types a plus-tag", async () => {
    const { controller } = controllerWithUser("jane@gmail.com");
    await callRoute(controller, "forgotPassword", { userEmail: "jane+church@gmail.com" });
    expect(UserHelper.sendForgotEmail).toHaveBeenCalledWith("jane@gmail.com", expect.any(String), undefined, undefined);
  });
});
