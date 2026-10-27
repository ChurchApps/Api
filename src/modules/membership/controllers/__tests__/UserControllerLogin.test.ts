import "reflect-metadata";

const chain: any = new Proxy(function () {}, { get: () => chain, apply: () => chain });

jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("express-validator", () => ({ body: () => chain, oneOf: () => chain, validationResult: jest.fn(() => ({ isEmpty: () => true, array: () => [] })) }));
jest.mock("bcryptjs", () => {
  const compareSync = jest.fn();
  return { __esModule: true, default: { compareSync, hashSync: jest.fn(() => "hashed") }, compareSync };
});
jest.mock("../../auth/index", () => ({
  AuthenticatedUser: {
    login: jest.fn(async (churches: any[], user: any) => ({ user: { id: user.id, email: user.email }, userChurches: churches })),
    loadUserByJwt: jest.fn()
  }
}));
jest.mock("../../helpers/index", () => {
  const { LoginRateLimiter } = require("../../helpers/LoginRateLimiter");
  return {
    LoginRateLimiter,
    UserHelper: { replaceDomainAdminPermissions: jest.fn(), addAllReportingPermissions: jest.fn() },
    UserChurchHelper: { createForNewUser: jest.fn() },
    UniqueIdHelper: { shortId: () => "tmp" },
    Environment: { currentEnvironment: "test", jwtSecret: "test-secret" },
    Permissions: { server: { admin: "serverAdmin" }, people: { edit: "peopleEdit" } },
    AuditLogHelper: { getClientIp: jest.fn(() => "1.1.1.1"), logLogin: jest.fn(), log: jest.fn() },
    MauticHelper: { trackLogin: jest.fn(() => Promise.resolve()) },
    ChurchHelper: { appendLogos: jest.fn(async () => {}) }
  };
});
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: (arr: any[], k: string, v: any) => (arr || []).find((x: any) => x[k] === v) || null, getAll: () => [] } }));
jest.mock("uuid", () => ({ v4: () => "guid" }));

import bcrypt from "bcryptjs";
import { UserController } from "../UserController.js";
import { AuthenticatedUser } from "../../auth/index.js";
import { LoginRateLimiter } from "../../helpers/LoginRateLimiter.js";
import { MfaHelper } from "../../helpers/MfaHelper.js";
import { TotpHelper } from "../../helpers/TotpHelper.js";

// Stands in for the loginAttempts table, shared by every controller built in one test.
function attemptStore() {
  const counts: Record<string, number> = {};
  return {
    counts,
    repo: {
      loadCount: jest.fn(async (key: string) => counts[key] ?? 0),
      increment: jest.fn(async (key: string) => { counts[key] = (counts[key] ?? 0) + 1; }),
      clear: jest.fn(async (keys: string[]) => { keys.forEach((k) => delete counts[k]); })
    }
  };
}

function userController(opts: any = {}) {
  const existing = opts.user ?? null;
  const attempts = opts.attempts ?? attemptStore();
  const repos: any = {
    user: {
      loadByEmail: jest.fn(async () => existing),
      loadByAuthGuid: jest.fn(async () => opts.authUser ?? null),
      load: jest.fn(async () => existing),
      save: jest.fn(async (u: any) => u)
    },
    userMfa: opts.userMfa ?? { isEnabled: jest.fn(async () => false) },
    rolePermission: { loadForUser: jest.fn(async () => opts.userChurches ?? [{ church: { id: "c1", name: "Test Church" } }]) },
    loginAttempt: attempts.repo
  };
  const controller = new UserController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  (controller as any).denyAccess = (errors: string[]) => ({ obj: { errors }, status: 401 });
  (controller as any).error = (errors: string[]) => ({ obj: { errors }, status: 500 });
  (controller as any).getUserChurches = jest.fn(async () => opts.loginChurches ?? [{ church: { id: "c1", name: "Test Church" }, person: { id: "p1" } }]);
  return { controller, repos, attempts };
}

function credReq(body: any = {}) {
  return { body: { email: "a@b.c", password: "secret1", ...body }, headers: {}, socket: { remoteAddress: "1.1.1.1" } };
}

beforeEach(() => {
  (bcrypt.compareSync as jest.Mock).mockReset();
  (AuthenticatedUser.login as jest.Mock).mockClear();
  (AuthenticatedUser.loadUserByJwt as jest.Mock).mockReset();
});

describe("UserController.verifyCredentials oracle", () => {
  it("returns the same 401 for unknown email and bad password", async () => {
    const unknown = userController({ user: null });
    const unknownResult: any = await (unknown.controller as any).verifyCredentials(credReq({ email: "missing@b.c" }), {});
    const known = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(false);
    const badPwResult: any = await (known.controller as any).verifyCredentials(credReq(), {});
    expect(unknownResult).toEqual({ obj: { errors: ["Login failed"] }, status: 401 });
    expect(badPwResult).toEqual(unknownResult);
    expect(known.repos.rolePermission.loadForUser).not.toHaveBeenCalled();
  });

  it("spends one bcrypt compare on an unknown email, so the two failures cost the same", async () => {
    const { controller } = userController({ user: null });
    await (controller as any).verifyCredentials(credReq({ email: "missing@b.c" }), {});
    expect(bcrypt.compareSync).toHaveBeenCalledTimes(1);
    expect((bcrypt.compareSync as jest.Mock).mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
  });

  it("returns churches when credentials match", async () => {
    const { controller } = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(true);
    const result: any = await (controller as any).verifyCredentials(credReq(), {});
    expect(result).toEqual({ obj: { churches: ["Test Church"] }, status: 200 });
  });
});

describe("UserController.login", () => {
  it("returns the same 401 for unknown email and bad password", async () => {
    const unknown = userController({ user: null });
    const unknownResult: any = await (unknown.controller as any).login(credReq({ email: "missing@b.c" }), {});
    const known = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(false);
    const badPwResult: any = await (known.controller as any).login(credReq(), {});
    expect(unknownResult).toEqual({ obj: { errors: ["Login failed"] }, status: 401 });
    expect(badPwResult).toEqual(unknownResult);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("spends one bcrypt compare on an unknown email, so the two failures cost the same", async () => {
    const { controller } = userController({ user: null });
    await (controller as any).login(credReq({ email: "missing@b.c" }), {});
    expect(bcrypt.compareSync).toHaveBeenCalledTimes(1);
    expect((bcrypt.compareSync as jest.Mock).mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
  });

  it("returns 200 when credentials match", async () => {
    const { controller, repos } = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(true);
    const result: any = await (controller as any).login(credReq(), {});
    expect(result.status).toBe(200);
    expect(result.obj.user.email).toBe("a@b.c");
    expect(repos.user.save).toHaveBeenCalled();
    expect(AuthenticatedUser.login).toHaveBeenCalled();
  });
});

describe("UserController credential rate limit", () => {
  it("counts failures in shared storage rather than process memory", async () => {
    const attempts = attemptStore();
    const { controller } = userController({ user: null, attempts });
    await (controller as any).login(credReq(), {});
    // A different controller instance stands in for a second Lambda container.
    const other = userController({ user: null, attempts });
    await (other.controller as any).login(credReq(), {});
    expect(attempts.counts["account|a@b.c"]).toBe(2);
    expect(attempts.counts["ip|1.1.1.1"]).toBe(2);
  });

  it("returns 429 on login once the account bucket is full and skips the user lookup", async () => {
    const attempts = attemptStore();
    attempts.counts["account|a@b.c"] = LoginRateLimiter.maxPerAccount;
    const { controller, repos } = userController({ user: null, attempts });
    const result: any = await (controller as any).login(credReq(), {});
    expect(result).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
  });

  it("returns 429 on verifyCredentials once the account bucket is full and skips the user lookup", async () => {
    const attempts = attemptStore();
    attempts.counts["account|a@b.c"] = LoginRateLimiter.maxPerAccount;
    const { controller, repos } = userController({ user: null, attempts });
    const result: any = await (controller as any).verifyCredentials(credReq(), {});
    expect(result).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
  });

  it("blocks a spray across many accounts from one ip", async () => {
    const attempts = attemptStore();
    attempts.counts["ip|1.1.1.1"] = LoginRateLimiter.maxPerIp;
    const { controller, repos } = userController({ user: null, attempts });
    const result: any = await (controller as any).login(credReq({ email: "fresh@b.c" }), {});
    expect(result).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
  });

  it("clears the account counter after a successful login, but not the ip counter", async () => {
    const attempts = attemptStore();
    const { controller } = userController({ user: null, attempts });
    await (controller as any).login(credReq(), {});
    expect(attempts.counts["account|a@b.c"]).toBe(1);

    const ok = userController({ user: { id: "u1", email: "a@b.c", password: "hash" }, attempts });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(true);
    const result: any = await (ok.controller as any).login(credReq(), {});
    expect(result.status).toBe(200);
    expect(attempts.counts["account|a@b.c"]).toBeUndefined();
    expect(attempts.counts["ip|1.1.1.1"]).toBe(1);
  });

  it("does not throttle a jwt refresh, even from an ip that is over the limit", async () => {
    const attempts = attemptStore();
    attempts.counts["ip|1.1.1.1"] = LoginRateLimiter.maxPerIp;
    const { controller } = userController({ user: null, attempts });
    (AuthenticatedUser.loadUserByJwt as jest.Mock).mockResolvedValue({ id: "u1", email: "a@b.c" });
    const result: any = await (controller as any).login({ body: { jwt: "refresh-token" }, headers: {}, socket: { remoteAddress: "1.1.1.1" } }, {});
    expect(result.status).toBe(200);
    expect(AuthenticatedUser.loadUserByJwt).toHaveBeenCalled();
  });

  it("does not let a spoofed x-forwarded-for reset the ip bucket", async () => {
    const attempts = attemptStore();
    attempts.counts["ip|203.0.113.7"] = LoginRateLimiter.maxPerIp;
    const { controller } = userController({ user: null, attempts });
    // Attacker prepends their own hop; API Gateway appends the real source ip last.
    const req: any = { ...credReq({ email: "fresh@b.c" }), headers: { "x-forwarded-for": "8.8.8.8, 203.0.113.7" } };
    const result: any = await (controller as any).login(req, {});
    expect(result.status).toBe(429);
  });
});

describe("UserController.login two-factor", () => {
  const secret = TotpHelper.generateSecret();
  function mfaRepo() {
    const row: any = { userId: "u1", secret, enabled: true, lastUsedStep: null, backupCodes: JSON.stringify([MfaHelper.hashBackupCode("abcde-fghjk")]) };
    return {
      row,
      isEnabled: jest.fn(async () => true),
      load: jest.fn(async () => ({ ...row })),
      claimStep: jest.fn(async (_id: string, step: number) => {
        if (row.lastUsedStep !== null && row.lastUsedStep >= step) return false;
        row.lastUsedStep = step;
        return true;
      }),
      replaceBackupCodes: jest.fn(async (_id: string, expected: string, next: string) => {
        if (row.backupCodes !== expected) return false;
        row.backupCodes = next;
        return true;
      })
    };
  }

  beforeEach(() => { jest.spyOn(MfaHelper, "decryptSecret").mockImplementation((s: string) => s); });

  it("answers a correct password with a challenge instead of tokens", async () => {
    const { controller } = userController({ user: { id: "u1", email: "a@b.c", password: "hash" }, userMfa: mfaRepo() });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(true);
    const result: any = await (controller as any).login(credReq(), {});
    expect(result.status).toBe(200);
    expect(result.obj.mfaRequired).toBe(true);
    expect(result.obj.user).toBeUndefined();
    expect(MfaHelper.verifyLoginToken(result.obj.mfaToken)).toBe("u1");
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("logs in with the challenge token and a current code, and refuses the same code twice", async () => {
    const userMfa = mfaRepo();
    const { controller } = userController({ user: { id: "u1", email: "a@b.c" }, userMfa });
    const mfaToken = MfaHelper.createLoginToken("u1");
    const code = TotpHelper.codeAt(secret, TotpHelper.currentStep());
    const ok: any = await (controller as any).login({ body: { mfaToken, mfaCode: code }, headers: {}, socket: { remoteAddress: "1.1.1.1" } }, {});
    expect(ok.status).toBe(200);
    expect(ok.obj.user.id).toBe("u1");
    const replay: any = await (controller as any).login({ body: { mfaToken, mfaCode: code }, headers: {}, socket: { remoteAddress: "1.1.1.1" } }, {});
    expect(replay).toEqual({ obj: { errors: ["Invalid code"] }, status: 401 });
  });

  it("accepts a backup code once", async () => {
    const userMfa = mfaRepo();
    const { controller } = userController({ user: { id: "u1", email: "a@b.c" }, userMfa });
    const body = { mfaToken: MfaHelper.createLoginToken("u1"), mfaCode: "ABCDE FGHJK" };
    expect((await (controller as any).login({ body, headers: {}, socket: {} }, {})).status).toBe(200);
    expect((await (controller as any).login({ body, headers: {}, socket: {} }, {})).status).toBe(401);
  });

  it("rejects a forged challenge token and a user jwt posing as one", async () => {
    const { controller } = userController({ user: { id: "u1", email: "a@b.c" }, userMfa: mfaRepo() });
    const code = TotpHelper.codeAt(secret, TotpHelper.currentStep());
    const jwt = require("jsonwebtoken");
    const userJwt = jwt.sign({ id: "u1", purpose: "mfa" }, "test-secret");
    const result: any = await (controller as any).login({ body: { mfaToken: userJwt, mfaCode: code }, headers: {}, socket: {} }, {});
    expect(result.status).toBe(401);
  });

  it("does not challenge a jwt refresh", async () => {
    const { controller } = userController({ user: null, userMfa: mfaRepo() });
    (AuthenticatedUser.loadUserByJwt as jest.Mock).mockResolvedValue({ id: "u1", email: "a@b.c" });
    const result: any = await (controller as any).login({ body: { jwt: "refresh" }, headers: {}, socket: {} }, {});
    expect(result.obj.user.id).toBe("u1");
  });
});
