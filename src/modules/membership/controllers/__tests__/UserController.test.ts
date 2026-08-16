import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({
  MembershipBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    denyAccess(errors: any) { return { errors, status: 401 }; }
    error(errors: any) { return { errors, status: 500 }; }
  }
}));
jest.mock("../../helpers/index", () => {
  const { AuthGuidHelper } = jest.requireActual("../../helpers/AuthGuidHelper");
  return {
    AuthGuidHelper,
    UserHelper: { sendWelcomeEmail: jest.fn(), sendForgotEmail: jest.fn(), sendInviteEmail: jest.fn() },
    UserChurchHelper: { createForNewUser: jest.fn() },
    UniqueIdHelper: { shortId: () => "tmpPass" },
    Environment: { currentEnvironment: "test", isMailConfigured: true, emailOnRegistration: false },
    Permissions: { people: { edit: "peopleEdit" }, server: { admin: "serverAdmin" } },
    AuditLogHelper: { getClientIp: () => "1.1.1.1", logLogin: jest.fn(), log: jest.fn() },
    MauticHelper: { trackLogin: jest.fn(() => Promise.resolve()) },
    ChurchHelper: { appendLogos: jest.fn(async () => {}) }
  };
});
jest.mock("../../auth/index", () => ({ AuthenticatedUser: { login: jest.fn(), loadUserByJwt: jest.fn() } }));
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: (arr: any[], k: string, v: any) => (arr || []).find((x: any) => x[k] === v) } }));

import bcrypt from "bcryptjs";
import { UserController } from "../UserController.js";
import { AuthGuidHelper, AuditLogHelper, Environment } from "../../helpers/index.js";
import { AuthenticatedUser } from "../../auth/index.js";

// Backs the mocked repo with a single mutable "row" so loads hand out independent snapshots
// (as separate DB reads would) and consumeAuthGuid arbitrates between them like the real UPDATE.
function userController(initial: any) {
  const row: any = initial ? { ...initial } : null;
  const snapshot = async () => (row ? { ...row } : null);
  const repos: any = {
    user: {
      loadByAuthGuid: jest.fn(snapshot),
      loadByEmail: jest.fn(snapshot),
      load: jest.fn(snapshot),
      save: jest.fn(async (u: any) => { if (row) Object.assign(row, u); return u; }),
      consumeAuthGuid: jest.fn(async (id: string, expected: string, replacement: string) => {
        if (!row || row.id !== id || row.authGuid !== expected || expected === replacement) return false;
        row.authGuid = replacement;
        return true;
      }),
      loadCount: jest.fn(async () => 1),
      updateVerification: jest.fn(),
      incrementVerificationAttempts: jest.fn(async () => 1),
      clearVerification: jest.fn()
    },
    userChurch: { loadByUserId: jest.fn(), save: jest.fn() },
    person: { searchEmail: jest.fn(async () => []) },
    role: { loadAll: jest.fn(async () => []) },
    roleMember: { save: jest.fn() }
  };
  const controller = new UserController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ id: "u1", churchId: "c1", checkAccess: () => true, email: "admin@b.c" });
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).denyAccess = (errors: any) => ({ errors, status: 401 });
  (controller as any).getUserChurches = jest.fn(async () => [{ church: { id: "c1" }, person: { id: "p1" } }]);
  return { controller, repos, row };
}

describe("UserController authGuid", () => {
  beforeEach(() => {
    (AuthenticatedUser.login as jest.Mock).mockReset();
    (AuthenticatedUser.login as jest.Mock).mockImplementation(async (_c: any, user: any) => ({ user: { id: user.id, email: user.email, firstName: user.firstName }, userChurches: [] }));
    Environment.isMailConfigured = true;
  });

  it("logs in once with a guid then rejects reuse", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });

    const first: any = await (controller as any).login({ body: { authGuid: minted.raw } }, {});
    expect(first.status).toBe(200);
    expect(AuthGuidHelper.canLogin(row.authGuid)).toBe(false);
    expect(repos.user.save).toHaveBeenCalled();

    const second: any = await (controller as any).login({ body: { authGuid: minted.raw } }, {});
    expect(second.status).toBe(401);
    expect(AuthenticatedUser.login).toHaveBeenCalledTimes(1);
  });

  it("lets only one of several concurrent logins consume the same guid", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });

    // All five load the row before any of them writes, so each sees an unused guid.
    const results: any[] = await Promise.all(Array.from({ length: 5 }, () => (controller as any).login({ body: { authGuid: minted.raw } }, {})));

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 401)).toHaveLength(4);
    expect(AuthenticatedUser.login).toHaveBeenCalledTimes(1);
    expect(repos.user.consumeAuthGuid).toHaveBeenCalledTimes(5);
    expect(AuthGuidHelper.canLogin(row.authGuid)).toBe(false);
  });

  it("marks the guid used before issuing credentials", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });
    const order: string[] = [];
    const consume = repos.user.consumeAuthGuid.getMockImplementation();
    repos.user.consumeAuthGuid.mockImplementation(async (...args: any[]) => { order.push("consume"); return consume(...args); });
    (AuthenticatedUser.login as jest.Mock).mockImplementation(async (_c: any, u: any) => { order.push("issue"); return { user: { id: u.id } }; });

    const result: any = await (controller as any).login({ body: { authGuid: minted.raw } }, {});
    expect(result.status).toBe(200);
    expect(order).toEqual(["consume", "issue"]);
    expect(AuthGuidHelper.parse(row.authGuid)?.loginUsed).toBe(true);
  });

  it("awaits the login write before responding", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });
    let saved = false;
    repos.user.save.mockImplementation(async (u: any) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      Object.assign(row, u);
      saved = true;
      return u;
    });

    const result: any = await (controller as any).login({ body: { authGuid: minted.raw } }, {});
    expect(result.status).toBe(200);
    expect(saved).toBe(true);
    expect(row.lastLogin).toBeInstanceOf(Date);
  });

  it("denies login when the guid is consumed by someone else mid-request", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });
    repos.user.consumeAuthGuid.mockResolvedValue(false);

    const result: any = await (controller as any).login({ body: { authGuid: minted.raw } }, {});
    expect(result.status).toBe(401);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("accepts a legacy plaintext guid exactly once", async () => {
    const legacy = "11111111-1111-4111-8111-111111111111";
    const { controller, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: legacy });

    const first: any = await (controller as any).login({ body: { authGuid: legacy } }, {});
    expect(first.status).toBe(200);
    expect(row.authGuid).not.toBe(legacy);
    expect(AuthGuidHelper.parse(row.authGuid)?.hash).toBe(AuthGuidHelper.hash(legacy));

    const second: any = await (controller as any).login({ body: { authGuid: legacy } }, {});
    expect(second.status).toBe(401);
    expect(AuthenticatedUser.login).toHaveBeenCalledTimes(1);
  });

  it("still allows setPasswordGuid after the lookup login", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, row } = userController({ id: "u1", email: "a@b.c", authGuid: AuthGuidHelper.markLoginUsed(minted.stored, minted.raw) });
    const result: any = await (controller as any).setPasswordGuid({ body: { authGuid: minted.raw, newPassword: "newpass1" } }, {});
    expect(result.success).toBe(true);
    expect(row.authGuid).toBe("");
  });

  it("rejects an expired guid for login and setPasswordGuid", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: `${AuthGuidHelper.hash(minted.raw)}:${Date.now() - 1}` });
    const login: any = await (controller as any).login({ body: { authGuid: minted.raw } }, {});
    expect(login.status).toBe(401);
    expect(repos.user.consumeAuthGuid).not.toHaveBeenCalled();
    const setPw: any = await (controller as any).setPasswordGuid({ body: { authGuid: minted.raw, newPassword: "newpass1" } }, {});
    expect(setPw.success).toBe(false);
  });

  it("verifyCode returns a fresh raw guid and stores the hash", async () => {
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", authGuid: "old-standing", verificationCode: bcrypt.hashSync("123456", 10), verificationExpires: new Date(Date.now() + 60000) });
    const result: any = await (controller as any).verifyCode({ body: { email: "a@b.c", code: "123456" } }, {});
    expect(result.status).toBe(200);
    expect(result.obj.authGuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row.authGuid).not.toBe(result.obj.authGuid);
    expect(AuthGuidHelper.parse(row.authGuid)?.hash).toBe(AuthGuidHelper.hash(result.obj.authGuid));
    expect(repos.user.save).toHaveBeenCalled();
  });

  it("register does not return authGuid when mail is configured", async () => {
    const { controller, repos } = userController(null);
    repos.user.loadByEmail.mockResolvedValue(null);
    const result: any = await (controller as any).register({ body: { email: "new@b.c", firstName: "N", lastName: "U" } }, { status: () => ({ json: (o: any) => o }) });
    expect(result.status).toBe(200);
    expect(result.obj.authGuid).toBeFalsy();
    expect(result.obj.mailConfigured).toBe(true);
  });

  it("register returns a one-time raw guid when mail is not configured", async () => {
    Environment.isMailConfigured = false;
    const { controller, repos } = userController(null);
    repos.user.loadByEmail.mockResolvedValue(null);
    let saved: any;
    repos.user.save.mockImplementation(async (u: any) => { saved = u; return { ...u, id: "new1" }; });
    const result: any = await (controller as any).register({ body: { email: "new@b.c", firstName: "N", lastName: "U" } }, { status: () => ({ json: (o: any) => o }) });
    expect(result.status).toBe(200);
    expect(result.obj.authGuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saved.authGuid).not.toBe(result.obj.authGuid);
    expect(AuthGuidHelper.parse(saved.authGuid)?.hash).toBe(AuthGuidHelper.hash(result.obj.authGuid));
  });
});

function passwordController(opts: any = {}) {
  const hashed = bcrypt.hashSync("oldpass", 10);
  const user = opts.user === undefined ? { id: "u1", email: "a@b.c", password: hashed } : opts.user;
  const saved: any[] = [];
  const repos: any = {
    user: {
      load: jest.fn(async () => (user ? { ...user } : null)),
      loadByAuthGuid: jest.fn(async (g: string) => (opts.guidUser && opts.guidUser.authGuid === g ? { ...opts.guidUser } : null)),
      save: jest.fn(async (u: any) => { saved.push({ ...u }); return u; })
    }
  };
  const au = { id: "u1", churchId: "c1" };
  const controller = new UserController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).denyAccess = (errors: string[]) => ({ obj: { errors }, status: 401 });
  return { controller, repos, saved };
}

describe("UserController.updatePassword", () => {
  it("rejects a JWT-only change without currentPassword", async () => {
    const { controller, repos } = passwordController();
    const result: any = await controller.updatePassword({ body: { newPassword: "newpass" } } as any, {} as any);
    expect(result.status).toBe(401);
    expect(repos.user.save).not.toHaveBeenCalled();
  });

  it("rejects a wrong currentPassword", async () => {
    const { controller, repos } = passwordController();
    const result: any = await controller.updatePassword({ body: { newPassword: "newpass", currentPassword: "wrong" } } as any, {} as any);
    expect(result.status).toBe(401);
    expect(repos.user.save).not.toHaveBeenCalled();
  });

  it("changes the password when currentPassword matches", async () => {
    const { controller, repos, saved } = passwordController();
    const result: any = await controller.updatePassword({ body: { newPassword: "newpass", currentPassword: "oldpass" } } as any, {} as any);
    expect(result.status).toBe(200);
    expect(repos.user.save).toHaveBeenCalled();
    expect(bcrypt.compareSync("newpass", saved[0].password)).toBe(true);
    expect(result.obj.password).toBe(null);
    expect(AuditLogHelper.log).toHaveBeenCalled();
  });

  it("invalidates any standing authGuid on password change", async () => {
    const { controller, saved } = passwordController({ user: { id: "u1", email: "a@b.c", password: bcrypt.hashSync("oldpass", 10), authGuid: AuthGuidHelper.mint().stored } });
    const result: any = await controller.updatePassword({ body: { newPassword: "newpass", currentPassword: "oldpass" } } as any, {} as any);
    expect(result.status).toBe(200);
    expect(saved[0].authGuid).toBe("");
  });
});

describe("UserController.setPasswordGuid", () => {
  it("resets the password with authGuid and no current password", async () => {
    const guidUser = { id: "u2", email: "b@c.d", authGuid: "reset-guid", password: bcrypt.hashSync("oldpass", 10) };
    const { controller, repos, saved } = passwordController({ guidUser });
    const result: any = await controller.setPasswordGuid({ body: { authGuid: "reset-guid", newPassword: "freshpass" } } as any, {} as any);
    expect(result.success).toBe(true);
    expect(repos.user.save).toHaveBeenCalled();
    expect(saved[0].authGuid).toBe("");
    expect(bcrypt.compareSync("freshpass", saved[0].password)).toBe(true);
  });

  it("fails for an unknown authGuid", async () => {
    const { controller, repos } = passwordController();
    const result: any = await controller.setPasswordGuid({ body: { authGuid: "nope", newPassword: "freshpass" } } as any, {} as any);
    expect(result.success).toBe(false);
    expect(repos.user.save).not.toHaveBeenCalled();
  });
});
