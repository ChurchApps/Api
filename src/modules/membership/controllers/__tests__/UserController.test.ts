import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({
  MembershipBaseController: class {
    json(obj: unknown, status: number) { return { obj, status }; }
    denyAccess(errors: string[]) { return { errors, status: 401 }; }
    error(errors: string[]) { return { errors, status: 500 }; }
  }
}));
jest.mock("../../helpers/index", () => {
  const { AuthGuidHelper } = jest.requireActual("../../helpers/AuthGuidHelper");
  return {
    AuthGuidHelper,
    // These tests exercise authGuid, not throttling, so the limiter is stubbed open.
    LoginRateLimiter: {
      getClientIp: () => "1.1.1.1",
      allow: jest.fn(async () => true),
      recordFailure: jest.fn(async () => {}),
      clearFailures: jest.fn(async () => {})
    },
    PublicPersonRateLimiter: { allow: jest.fn(() => true) },
    UserHelper: { sendWelcomeEmail: jest.fn(), sendForgotEmail: jest.fn(), sendInviteEmail: jest.fn() },
    UserChurchHelper: { createForNewUser: jest.fn() },
    UniqueIdHelper: { shortId: () => "tmpPass", secret: () => "tmpPass" },
    Environment: { currentEnvironment: "test", isMailConfigured: true, emailOnRegistration: false },
    Permissions: { people: { edit: "peopleEdit" }, roles: { edit: "rolesEdit" }, server: { admin: "serverAdmin" } },
    AuditLogHelper: { getClientIp: () => "1.1.1.1", logLogin: jest.fn(), log: jest.fn() },
    MauticHelper: { trackLogin: jest.fn(() => Promise.resolve()), registerUser: jest.fn(() => Promise.resolve()) },
    ChurchHelper: { appendLogos: jest.fn(async () => {}) }
  };
});
jest.mock("../../auth/index", () => ({ AuthenticatedUser: { login: jest.fn(), loadUserByJwt: jest.fn() } }));
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTransactional: jest.fn() } }));
jest.mock("../../../../shared/helpers/ChurchEmailLimiter.js", () => ({ ChurchEmailLimiter: { reserve: jest.fn(async () => ["r1"]), settle: jest.fn(async () => {}) } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: (arr: Record<string, unknown>[], k: string, v: unknown) => (arr || []).find((x) => x[k] === v) } }));

import bcrypt from "bcryptjs";
import express from "express";
import type { AuthenticatedUser as ApiUser } from "@churchapps/apihelper";
import { UserController } from "../UserController.js";
import { AuthGuidHelper, AuditLogHelper, Environment, UserHelper, UserChurchHelper } from "../../helpers/index.js";
import { AuthenticatedUser } from "../../auth/index.js";
import type { User } from "../../models/index.js";

// Each repo is a bag of jest mocks; some tests add more mocks after the controller is built.
type RepoMocks = Record<string, Record<string, jest.Mock>>;
type Result = { status?: number; success?: boolean; obj?: Record<string, unknown> & { authGuid?: string; errors?: string[]; jwt?: string } };
const req = (data: Partial<express.Request>) => data as express.Request;
const res = {} as express.Response;
// register answers validation failures through res.status(...).json(...).
const jsonRes = {} as express.Response;
jsonRes.status = jest.fn(() => jsonRes);
jsonRes.json = jest.fn((o) => o);
const anon = (_req: express.Request, _res: express.Response, action: () => unknown) => action();
const authed = (au: Partial<ApiUser>) => (_req: express.Request, _res: express.Response, action: (au: ApiUser) => unknown) => action(au as ApiUser);

// Backs the mocked repo with a single mutable "row" so loads hand out independent snapshots
// (as separate DB reads would) and consumeAuthGuid arbitrates between them like the real UPDATE.
function userController(initial: User | null) {
  const row: User = initial ? { ...initial } : null;
  const snapshot = async () => (row ? { ...row } : null);
  const repos: RepoMocks = {
    user: {
      loadByAuthGuid: jest.fn(snapshot),
      loadByEmail: jest.fn(snapshot),
      load: jest.fn(snapshot),
      save: jest.fn(async (u: User) => { if (row) Object.assign(row, u); return u; }),
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
    person: { searchEmail: jest.fn(async (): Promise<unknown[]> => []) },
    role: { loadAll: jest.fn(async (): Promise<unknown[]> => []) },
    roleMember: { save: jest.fn() },
    userMfa: { isEnabled: jest.fn(async () => false) }
  };
  const controller = new UserController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: anon,
    actionWrapper: authed({ id: "u1", churchId: "c1", checkAccess: () => true, email: "admin@b.c" }),
    json: (obj: unknown, status: number) => ({ obj, status }),
    denyAccess: (errors: string[]) => ({ errors, status: 401 }),
    getUserChurches: jest.fn(async () => [{ church: { id: "c1" }, person: { id: "p1" } }])
  });
  return { controller, repos, row };
}

describe("UserController authGuid", () => {
  beforeEach(() => {
    (AuthenticatedUser.login as jest.Mock).mockReset();
    (AuthenticatedUser.login as jest.Mock).mockImplementation(async (_c: unknown, user: User) => ({ user: { id: user.id, email: user.email, firstName: user.firstName }, userChurches: [] }));
    Environment.isMailConfigured = true;
  });

  it("logs in once with a guid then rejects reuse", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });

    const first = await controller.login(req({ body: { authGuid: minted.raw } }), res) as Result;
    expect(first.status).toBe(200);
    expect(AuthGuidHelper.canLogin(row.authGuid)).toBe(false);
    expect(repos.user.save).toHaveBeenCalled();

    const second = await controller.login(req({ body: { authGuid: minted.raw } }), res) as Result;
    expect(second.status).toBe(401);
    expect(AuthenticatedUser.login).toHaveBeenCalledTimes(1);
  });

  it("lets only one of several concurrent logins consume the same guid", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });

    // All five load the row before any of them writes, so each sees an unused guid.
    const results = (await Promise.all(Array.from({ length: 5 }, () => controller.login(req({ body: { authGuid: minted.raw } }), res)))) as Result[];

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
    repos.user.consumeAuthGuid.mockImplementation(async (...args: unknown[]) => { order.push("consume"); return consume(...args); });
    (AuthenticatedUser.login as jest.Mock).mockImplementation(async (_c: unknown, u: User) => { order.push("issue"); return { user: { id: u.id } }; });

    const result = await controller.login(req({ body: { authGuid: minted.raw } }), res) as Result;
    expect(result.status).toBe(200);
    expect(order).toEqual(["consume", "issue"]);
    expect(AuthGuidHelper.parse(row.authGuid)?.loginUsed).toBe(true);
  });

  it("awaits the login write before responding", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });
    let saved = false;
    repos.user.save.mockImplementation(async (u: User) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      Object.assign(row, u);
      saved = true;
      return u;
    });

    const result = await controller.login(req({ body: { authGuid: minted.raw } }), res) as Result;
    expect(result.status).toBe(200);
    expect(saved).toBe(true);
    expect(row.lastLogin).toBeInstanceOf(Date);
  });

  it("denies login when the guid is consumed by someone else mid-request", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: minted.stored });
    repos.user.consumeAuthGuid.mockResolvedValue(false);

    const result = await controller.login(req({ body: { authGuid: minted.raw } }), res) as Result;
    expect(result.status).toBe(401);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("accepts a legacy plaintext guid exactly once", async () => {
    const legacy = "11111111-1111-4111-8111-111111111111";
    const { controller, row } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: legacy });

    const first = await controller.login(req({ body: { authGuid: legacy } }), res) as Result;
    expect(first.status).toBe(200);
    expect(row.authGuid).not.toBe(legacy);
    expect(AuthGuidHelper.parse(row.authGuid)?.hash).toBe(AuthGuidHelper.hash(legacy));

    const second = await controller.login(req({ body: { authGuid: legacy } }), res) as Result;
    expect(second.status).toBe(401);
    expect(AuthenticatedUser.login).toHaveBeenCalledTimes(1);
  });

  it("still allows setPasswordGuid after the lookup login", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, row } = userController({ id: "u1", email: "a@b.c", authGuid: AuthGuidHelper.markLoginUsed(minted.stored, minted.raw) });
    const result = await controller.setPasswordGuid(req({ body: { authGuid: minted.raw, newPassword: "newpass1" } }), res) as Result;
    expect(result.success).toBe(true);
    expect(row.authGuid).toBe("");
  });

  it("rejects an expired guid for login and setPasswordGuid", async () => {
    const minted = AuthGuidHelper.mint();
    const { controller, repos } = userController({ id: "u1", email: "a@b.c", firstName: "A", authGuid: `${AuthGuidHelper.hash(minted.raw)}:${Date.now() - 1}` });
    const login = await controller.login(req({ body: { authGuid: minted.raw } }), res) as Result;
    expect(login.status).toBe(401);
    expect(repos.user.consumeAuthGuid).not.toHaveBeenCalled();
    const setPw = await controller.setPasswordGuid(req({ body: { authGuid: minted.raw, newPassword: "newpass1" } }), res) as Result;
    expect(setPw.success).toBe(false);
  });

  it("verifyCode returns a fresh raw guid and stores the hash", async () => {
    const { controller, repos, row } = userController({ id: "u1", email: "a@b.c", authGuid: "old-standing", verificationCode: bcrypt.hashSync("123456", 10), verificationExpires: new Date(Date.now() + 60000) });
    const result = await controller.verifyCode(req({ body: { email: "a@b.c", code: "123456" } }), res) as Result;
    expect(result.status).toBe(200);
    expect(result.obj.authGuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row.authGuid).not.toBe(result.obj.authGuid);
    expect(AuthGuidHelper.parse(row.authGuid)?.hash).toBe(AuthGuidHelper.hash(result.obj.authGuid));
    expect(repos.user.save).toHaveBeenCalled();
  });

  it("register does not return authGuid when mail is configured", async () => {
    const { controller, repos } = userController(null);
    repos.user.loadByEmail.mockResolvedValue(null);
    const result = await controller.register(req({ body: { email: "new@b.c", firstName: "N", lastName: "U" } }), jsonRes) as Result;
    expect(result.status).toBe(200);
    expect(result.obj.authGuid).toBeFalsy();
    expect(result.obj.mailConfigured).toBe(true);
  });

  it("register fakes success and sends nothing for a too-fast submit", async () => {
    (UserHelper.sendWelcomeEmail as jest.Mock).mockClear();
    const { controller, repos } = userController(null);
    const result = await controller.register(req({ body: { email: "new@b.c", firstName: "N", lastName: "U", fillMs: 400 } }), res) as Result;
    expect(result.status).toBe(200);
    expect(result.obj.mailConfigured).toBe(true);
    expect(UserHelper.sendWelcomeEmail).not.toHaveBeenCalled();
    expect(repos.user.save).not.toHaveBeenCalled();
  });

  it("register accepts a human-paced signup even when autofill filled the old honeypot", async () => {
    (UserHelper.sendWelcomeEmail as jest.Mock).mockClear();
    const { controller, repos } = userController(null);
    repos.user.save.mockImplementation(async (u: User) => ({ ...u, id: "new1" }));
    await controller.register(req({ body: { email: "new@b.c", firstName: "N", lastName: "U", website: "https://autofilled.example", fillMs: 9000 } }), res);
    expect(UserHelper.sendWelcomeEmail).toHaveBeenCalled();
    expect(repos.user.save).toHaveBeenCalled();
  });

  it("register returns a one-time raw guid when mail is not configured", async () => {
    Environment.isMailConfigured = false;
    const { controller, repos } = userController(null);
    repos.user.loadByEmail.mockResolvedValue(null);
    let saved: User;
    repos.user.save.mockImplementation(async (u: User) => { saved = u; return { ...u, id: "new1" }; });
    const result = await controller.register(req({ body: { email: "new@b.c", firstName: "N", lastName: "U" } }), jsonRes) as Result;
    expect(result.status).toBe(200);
    expect(result.obj.authGuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(saved.authGuid).not.toBe(result.obj.authGuid);
    expect(AuthGuidHelper.parse(saved.authGuid)?.hash).toBe(AuthGuidHelper.hash(result.obj.authGuid));
  });
});

function passwordController(opts: { user?: User | null; guidUser?: User } = {}) {
  const hashed = bcrypt.hashSync("oldpass", 10);
  const user = opts.user === undefined ? { id: "u1", email: "a@b.c", password: hashed } : opts.user;
  const saved: User[] = [];
  const repos = {
    user: {
      load: jest.fn(async () => (user ? { ...user } : null)),
      loadByAuthGuid: jest.fn(async (g: string) => (opts.guidUser && opts.guidUser.authGuid === g ? { ...opts.guidUser } : null)),
      save: jest.fn(async (u: User) => { saved.push({ ...u }); return u; })
    }
  };
  const au = { id: "u1", churchId: "c1" };
  const controller = new UserController();
  Object.assign(controller, {
    repos,
    actionWrapper: authed(au),
    actionWrapperAnon: anon,
    json: (obj: unknown, status: number) => ({ obj, status }),
    denyAccess: (errors: string[]) => ({ obj: { errors }, status: 401 })
  });
  return { controller, repos, saved };
}

describe("UserController.updatePassword", () => {
  it("rejects a JWT-only change without currentPassword", async () => {
    const { controller, repos } = passwordController();
    const result = await controller.updatePassword(req({ body: { newPassword: "newpass" } }), res) as Result;
    expect(result.status).toBe(401);
    expect(repos.user.save).not.toHaveBeenCalled();
  });

  it("rejects a wrong currentPassword", async () => {
    const { controller, repos } = passwordController();
    const result = await controller.updatePassword(req({ body: { newPassword: "newpass", currentPassword: "wrong" } }), res) as Result;
    expect(result.status).toBe(401);
    expect(repos.user.save).not.toHaveBeenCalled();
  });

  it("changes the password when currentPassword matches", async () => {
    const { controller, repos, saved } = passwordController();
    const result = await controller.updatePassword(req({ body: { newPassword: "newpass", currentPassword: "oldpass" } }), res) as Result;
    expect(result.status).toBe(200);
    expect(repos.user.save).toHaveBeenCalled();
    expect(bcrypt.compareSync("newpass", saved[0].password)).toBe(true);
    expect(result.obj.password).toBe(null);
    expect(AuditLogHelper.log).toHaveBeenCalled();
  });

  it("invalidates any standing authGuid on password change", async () => {
    const { controller, saved } = passwordController({ user: { id: "u1", email: "a@b.c", password: bcrypt.hashSync("oldpass", 10), authGuid: AuthGuidHelper.mint().stored } });
    const result = await controller.updatePassword(req({ body: { newPassword: "newpass", currentPassword: "oldpass" } }), res) as Result;
    expect(result.status).toBe(200);
    expect(saved[0].authGuid).toBe("");
  });
});

describe("UserController.setPasswordGuid", () => {
  it("resets the password with authGuid and no current password", async () => {
    const guidUser = { id: "u2", email: "b@c.d", authGuid: "reset-guid", password: bcrypt.hashSync("oldpass", 10) };
    const { controller, repos, saved } = passwordController({ guidUser });
    const result = await controller.setPasswordGuid(req({ body: { authGuid: "reset-guid", newPassword: "freshpass" } }), res) as Result;
    expect(result.success).toBe(true);
    expect(repos.user.save).toHaveBeenCalled();
    expect(saved[0].authGuid).toBe("");
    expect(bcrypt.compareSync("freshpass", saved[0].password)).toBe(true);
  });

  it("fails for an unknown authGuid", async () => {
    const { controller, repos } = passwordController();
    const result = await controller.setPasswordGuid(req({ body: { authGuid: "nope", newPassword: "freshpass" } }), res) as Result;
    expect(result.success).toBe(false);
    expect(repos.user.save).not.toHaveBeenCalled();
  });
});

describe("UserController.loadOrCreate", () => {
  beforeEach(() => {
    (UserHelper.sendWelcomeEmail as jest.Mock).mockClear();
  });

  // Callers are an admin adding someone to a role, or an anonymous donation form -- in neither case
  // did the person ask for an account, so a "finish creating your account" code is unexpected mail.
  it("provisions a new user without emailing a verification code", async () => {
    const { controller, repos } = userController(null);
    repos.user.save.mockImplementation(async (u: User) => ({ ...u, id: "u9" }));

    const result = await controller.loadOrCreate(req({ body: { userEmail: "new@b.c", firstName: "New", lastName: "User" }, headers: {} }), res) as Result;

    expect(result.status).toBe(200);
    expect(result.obj.isNewUser).toBe(true);
    expect(UserHelper.sendWelcomeEmail).not.toHaveBeenCalled();
    expect(repos.user.updateVerification).not.toHaveBeenCalled();
  });

  it("still links the new user to a church", async () => {
    const { controller, repos } = userController(null);
    repos.user.save.mockImplementation(async (u: User) => ({ ...u, id: "u9" }));

    await controller.loadOrCreate(req({ body: { userEmail: "new@b.c", firstName: "New", lastName: "User" }, headers: {} }), res);

    expect(UserChurchHelper.createForNewUser).toHaveBeenCalledWith("u9", "new@b.c");
  });

  it("does not email an existing user", async () => {
    const { controller } = userController({ id: "u1", email: "a@b.c", firstName: "A", lastName: "B" });

    const result = await controller.loadOrCreate(req({ body: { userEmail: "a@b.c", firstName: "A", lastName: "B" }, headers: {} }), res) as Result;

    expect(result.status).toBe(200);
    expect(result.obj.isNewUser).toBe(false);
    expect(UserHelper.sendWelcomeEmail).not.toHaveBeenCalled();
  });
});

describe("UserController security scoping", () => {
  function scopedController(user: User | null, perms: unknown[], opts: { inChurch?: boolean } = {}) {
    const { controller, repos } = userController(user);
    repos.userChurch.loadByUserId.mockResolvedValue(opts.inChurch ? { id: "uc1" } : null);
    repos.roleMember.existsForUser = jest.fn(async () => false);
    // The mocked Permissions are plain strings, so checkAccess receives strings here.
    const au: Partial<ApiUser> = { id: "staff1", churchId: "c1", checkAccess: (p) => perms.includes(p) };
    Object.assign(controller, { actionWrapper: authed(au) });
    return { controller, repos };
  }

  it("blocks church staff from loading a user outside their church by id", async () => {
    const { controller } = scopedController({ id: "u5", email: "x@y.z", firstName: "X", lastName: "Y" }, ["peopleEdit"]);
    const result = await controller.loadOrCreate(req({ body: { userId: "u5" }, headers: {} }), res) as Result;
    expect(result.status).toBe(401);
  });

  it("lets church staff load a user linked to their church by id", async () => {
    const { controller } = scopedController({ id: "u5", email: "x@y.z", firstName: "X", lastName: "Y" }, ["peopleEdit"], { inChurch: true });
    const result = await controller.loadOrCreate(req({ body: { userId: "u5" }, headers: {} }), res) as Result;
    expect(result.status).toBe(200);
    expect(result.obj.firstName).toBe("X");
  });

  it("hides an existing unlinked user's name from church staff looking up by email", async () => {
    const { controller } = scopedController({ id: "u5", email: "x@y.z", firstName: "X", lastName: "Y" }, ["peopleEdit"]);
    const result = await controller.loadOrCreate(req({ body: { userEmail: "x@y.z", firstName: "A", lastName: "B" }, headers: {} }), res) as Result;
    expect(result.status).toBe(200);
    expect(result.obj).toEqual({ id: "u5", email: "x@y.z", isNewUser: false });
  });

  it("rate-limits register per ip", async () => {
    const { PublicPersonRateLimiter } = jest.requireMock("../../helpers/index");
    PublicPersonRateLimiter.allow.mockResolvedValueOnce(false);
    const { controller, repos } = scopedController(null, []);
    const result = await controller.register(req({ body: { email: "n@b.c", firstName: "N", lastName: "B" }, headers: {} }), res) as Result;
    expect(result.status).toBe(429);
    expect(repos.user.save).not.toHaveBeenCalled();
    expect(UserHelper.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("rate-limits checkEmail per ip", async () => {
    const { PublicPersonRateLimiter } = jest.requireMock("../../helpers/index");
    PublicPersonRateLimiter.allow.mockResolvedValueOnce(false);
    const { controller, repos } = scopedController(null, []);
    const result = await controller.checkEmail(req({ body: { email: "n@b.c" }, headers: {} }), res) as Result;
    expect(result.status).toBe(429);
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
  });

  it("audit-logs server-admin impersonation", async () => {
    (AuditLogHelper.log as jest.Mock).mockClear();
    AuthenticatedUser.getUserJwt = jest.fn(() => "jwt");
    const { controller } = scopedController({ id: "u5", email: "x@y.z" }, ["serverAdmin"]);
    const result = await controller.impersonate({ params: { id: "u5" }, headers: {} } as express.Request<{ id: string }>, res) as Result;
    expect(result.obj.jwt).toBe("jwt");
    expect(AuditLogHelper.log).toHaveBeenCalledWith(expect.anything(), "c1", "staff1", "security", "impersonate", "user", "u5", expect.anything(), "1.1.1.1");
  });
});

describe("UserController.sendInviteEmail", () => {
  const send = UserHelper.sendInviteEmail as jest.Mock;
  beforeEach(() => send.mockClear());

  async function invite(user: User | null) {
    const { controller, repos, row } = userController(user);
    repos.person.searchEmail.mockResolvedValue([{ email: "new@b.c" }]);
    repos.church = { loadById: jest.fn(async () => ({ name: "Grace" })) };
    const result = await controller.sendInviteEmail(req({ body: { email: "new@b.c", personName: "New", contextName: "Staff" }, headers: {} }), res) as Result;
    return { result, repos, row };
  }

  // loadOrCreate gives a brand-new user a random password, so the invite must let them set one.
  it("sends a never-logged-in user a 7-day set-password link", async () => {
    const created = new Date("2026-10-01T00:00:00Z");
    const { result, row } = await invite({ id: "u9", email: "new@b.c", registrationDate: created, lastLogin: created });
    expect(result.status).toBe(200);
    const [, , , , link, label] = send.mock.calls[0];
    expect(label).toBe("Set Your Password");
    const raw = link.match(/^\/login\?auth=([0-9a-f-]{36})$/)[1];
    const parsed = AuthGuidHelper.parse(row.authGuid);
    expect(parsed.hash).toBe(AuthGuidHelper.hash(raw));
    expect(parsed.expires).toBeGreaterThan(Date.now() + 6.9 * 24 * 60 * 60 * 1000);
    expect(parsed.expires).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);
  });

  it("sends a user who has logged in a plain login link", async () => {
    const { row } = await invite({ id: "u9", email: "new@b.c", registrationDate: new Date("2026-10-01T00:00:00Z"), lastLogin: new Date("2026-10-05T00:00:00Z") });
    const [, , , , link, label] = send.mock.calls[0];
    expect(link).toBe("/login");
    expect(label).toBe("Log In");
    expect(row.authGuid).toBeUndefined();
  });

  it("sends someone without an account to the register view", async () => {
    await invite(null);
    const [, , , , link, label] = send.mock.calls[0];
    expect(link).toBe("/login?action=register");
    expect(label).toBe("Sign Up");
  });

  // Role and group invites are a fixed template. They must send even when the church
  // is not approved for the template-email allowance, and they must not draw on it.
  it("sends the invite without drawing on the church email limit", async () => {
    const { ChurchEmailLimiter } = jest.requireMock("../../../../shared/helpers/ChurchEmailLimiter.js");
    ChurchEmailLimiter.reserve.mockClear();
    ChurchEmailLimiter.settle.mockClear();
    ChurchEmailLimiter.reserve.mockResolvedValueOnce(null);
    const { result } = await invite(null);
    expect(ChurchEmailLimiter.reserve).not.toHaveBeenCalled();
    expect(ChurchEmailLimiter.settle).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.obj).toEqual({ success: true });
  });

  // Prod 2026-11-15: a person record whose address has a space in the domain went to SES,
  // which threw "Domain contains control or whitespace" and the invite answered 500 four times.
  it("answers 400 without sending when the address has whitespace in it", async () => {
    const { controller, repos } = userController(null);
    repos.person.searchEmail.mockResolvedValue([{ email: "new@b .c" }]);
    repos.church = { loadById: jest.fn(async () => ({ name: "Grace" })) };
    const res = Object.assign({} as express.Response, { status: jest.fn(function (this: Record<string, unknown>, code: number) { this.code = code; return this; }), json: jest.fn(function (this: Record<string, unknown>) { return this; }) });
    await controller.sendInviteEmail(req({ body: { email: "new@b .c", personName: "New", contextName: "Staff" }, headers: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("UserController.Delete (#1627)", () => {
  function deleteController(soleChurchIds: string[]) {
    const { controller, repos } = userController({ id: "u1" });
    repos.user.delete = jest.fn();
    repos.userChurch.delete = jest.fn();
    repos.roleMember.deleteUser = jest.fn();
    repos.roleMember.loadSoleDomainAdminChurchIds = jest.fn(async () => soleChurchIds);
    repos.church = { loadByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id, name: "Grace Church" }))) };
    return { controller, repos };
  }

  it("refuses to delete the only Domain Admin's account and names the church", async () => {
    const { controller, repos } = deleteController(["c1"]);
    const result = await controller.Delete(req({}), res) as Result;
    expect(result.status).toBe(400);
    expect(result.obj.errors[0]).toContain("Grace Church");
    expect(repos.user.delete).not.toHaveBeenCalled();
    expect(repos.userChurch.delete).not.toHaveBeenCalled();
    expect(repos.roleMember.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the account when every church has another Domain Admin", async () => {
    const { controller, repos } = deleteController([]);
    await controller.Delete(req({}), res);
    expect(repos.user.delete).toHaveBeenCalledWith("u1");
    expect(repos.roleMember.deleteUser).toHaveBeenCalledWith("u1");
  });
});
