import "reflect-metadata";

// Stands in for any express-validator chain: every property and call returns the chain again.
type Chain = { (...args: unknown[]): Chain; [key: string]: Chain };
const chain: Chain = new Proxy(function () {} as Chain, { get: () => chain, apply: () => chain });

jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("express-validator", () => ({ body: () => chain, oneOf: () => chain, validationResult: jest.fn(() => ({ isEmpty: () => true, array: () => [] })) }));
jest.mock("bcryptjs", () => {
  const compareSync = jest.fn();
  return { __esModule: true, default: { compareSync, hashSync: jest.fn(() => "hashed") }, compareSync };
});
jest.mock("../../auth/index", () => ({
  AuthenticatedUser: {
    login: jest.fn(async (churches: LoginUserChurch[], user: User) => ({ user: { id: user.id, email: user.email }, userChurches: churches })),
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
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: (arr: Record<string, unknown>[], k: string, v: unknown) => (arr || []).find((x) => x[k] === v) || null, getAll: () => [] } }));
jest.mock("uuid", () => ({ v4: () => "guid" }));

import bcrypt from "bcryptjs";
import express from "express";
import { UserController } from "../UserController.js";
import { AuthenticatedUser } from "../../auth/index.js";
import { LoginRateLimiter } from "../../helpers/LoginRateLimiter.js";
import { MfaHelper } from "../../helpers/MfaHelper.js";
import { TotpHelper } from "../../helpers/TotpHelper.js";
import type { LoginUserChurch, User, UserMfa } from "../../models/index.js";

type Result = { status?: number; obj?: Record<string, unknown> & { user?: User; mfaToken?: string } };
const res = {} as express.Response;
const anon = (_req: express.Request, _res: express.Response, action: () => unknown) => action();
interface AttemptStore {
  counts: Record<string, number>;
  repo: { loadCount: jest.Mock; increment: jest.Mock; clear: jest.Mock };
}

interface ControllerOpts {
  user?: User | null;
  attempts?: AttemptStore;
  authUser?: User;
  userMfa?: { isEnabled: jest.Mock };
  userChurches?: LoginUserChurch[];
  loginChurches?: LoginUserChurch[];
}

// Stands in for the loginAttempts table, shared by every controller built in one test.
function attemptStore(): AttemptStore {
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

function userController(opts: ControllerOpts = {}) {
  const existing = opts.user ?? null;
  const attempts = opts.attempts ?? attemptStore();
  const repos = {
    user: {
      loadByEmail: jest.fn(async () => existing),
      loadByAuthGuid: jest.fn(async () => opts.authUser ?? null),
      load: jest.fn(async () => existing),
      save: jest.fn(async (u: User) => u)
    },
    userMfa: opts.userMfa ?? { isEnabled: jest.fn(async () => false) },
    rolePermission: { loadForUser: jest.fn(async () => opts.userChurches ?? [{ church: { id: "c1", name: "Test Church" } }]) },
    loginAttempt: attempts.repo
  };
  const controller = new UserController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: anon,
    json: (obj: unknown, status: number) => ({ obj, status }),
    denyAccess: (errors: string[]) => ({ obj: { errors }, status: 401 }),
    error: (errors: string[]) => ({ obj: { errors }, status: 500 }),
    getUserChurches: jest.fn(async () => opts.loginChurches ?? [{ church: { id: "c1", name: "Test Church" }, person: { id: "p1" } }])
  });
  return { controller, repos, attempts };
}

function credReq(body: Record<string, unknown> = {}) {
  return { body: { email: "a@b.c", password: "secret1", ...body }, headers: {}, socket: { remoteAddress: "1.1.1.1" } } as express.Request;
}

beforeEach(() => {
  (bcrypt.compareSync as jest.Mock).mockReset();
  (AuthenticatedUser.login as jest.Mock).mockClear();
  (AuthenticatedUser.loadUserByJwt as jest.Mock).mockReset();
});

describe("UserController.verifyCredentials oracle", () => {
  it("returns the same 401 for unknown email and bad password", async () => {
    const unknown = userController({ user: null });
    const unknownResult = await unknown.controller.verifyCredentials(credReq({ email: "missing@b.c" }), res) as Result;
    const known = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(false);
    const badPwResult = await known.controller.verifyCredentials(credReq(), res) as Result;
    expect(unknownResult).toEqual({ obj: { errors: ["Login failed"] }, status: 401 });
    expect(badPwResult).toEqual(unknownResult);
    expect(known.repos.rolePermission.loadForUser).not.toHaveBeenCalled();
  });

  it("spends one bcrypt compare on an unknown email, so the two failures cost the same", async () => {
    const { controller } = userController({ user: null });
    await controller.verifyCredentials(credReq({ email: "missing@b.c" }), res);
    expect(bcrypt.compareSync).toHaveBeenCalledTimes(1);
    expect((bcrypt.compareSync as jest.Mock).mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
  });

  it("returns churches when credentials match", async () => {
    const { controller } = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(true);
    const result = await controller.verifyCredentials(credReq(), res) as Result;
    expect(result).toEqual({ obj: { churches: ["Test Church"] }, status: 200 });
  });
});

describe("UserController.login", () => {
  // Production: "reading 'trim'" 500 on /membership/users/login for a body with no email, jwt, authGuid or mfaToken.
  it.each([[undefined], [12345]])("fails the login without crashing when email is %s", async (email) => {
    (bcrypt.compareSync as jest.Mock).mockReturnValue(false);
    const { controller, repos } = userController({ user: null });
    const result = await controller.login(credReq({ email }), res) as Result;
    expect(result.status).toBe(401);
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
    expect(bcrypt.compareSync).toHaveBeenCalledTimes(1);
  });

  it("returns the same 401 for unknown email and bad password", async () => {
    const unknown = userController({ user: null });
    const unknownResult = await unknown.controller.login(credReq({ email: "missing@b.c" }), res) as Result;
    const known = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(false);
    const badPwResult = await known.controller.login(credReq(), res) as Result;
    expect(unknownResult).toEqual({ obj: { errors: ["Login failed"] }, status: 401 });
    expect(badPwResult).toEqual(unknownResult);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("spends one bcrypt compare on an unknown email, so the two failures cost the same", async () => {
    const { controller } = userController({ user: null });
    await controller.login(credReq({ email: "missing@b.c" }), res);
    expect(bcrypt.compareSync).toHaveBeenCalledTimes(1);
    expect((bcrypt.compareSync as jest.Mock).mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$/);
  });

  it("returns 200 when credentials match", async () => {
    const { controller, repos } = userController({ user: { id: "u1", email: "a@b.c", password: "hash" } });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(true);
    const result = await controller.login(credReq(), res) as Result;
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
    await controller.login(credReq(), res);
    // A different controller instance stands in for a second Lambda container.
    const other = userController({ user: null, attempts });
    await other.controller.login(credReq(), res);
    expect(attempts.counts["account|a@b.c"]).toBe(2);
    expect(attempts.counts["ip|1.1.1.1"]).toBe(2);
  });

  it("returns 429 on login once the account bucket is full and skips the user lookup", async () => {
    const attempts = attemptStore();
    attempts.counts["account|a@b.c"] = LoginRateLimiter.maxPerAccount;
    const { controller, repos } = userController({ user: null, attempts });
    const result = await controller.login(credReq(), res) as Result;
    expect(result).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
  });

  it("returns 429 on verifyCredentials once the account bucket is full and skips the user lookup", async () => {
    const attempts = attemptStore();
    attempts.counts["account|a@b.c"] = LoginRateLimiter.maxPerAccount;
    const { controller, repos } = userController({ user: null, attempts });
    const result = await controller.verifyCredentials(credReq(), res) as Result;
    expect(result).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
  });

  it("blocks a spray across many accounts from one ip", async () => {
    const attempts = attemptStore();
    attempts.counts["ip|1.1.1.1"] = LoginRateLimiter.maxPerIp;
    const { controller, repos } = userController({ user: null, attempts });
    const result = await controller.login(credReq({ email: "fresh@b.c" }), res) as Result;
    expect(result).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
    expect(repos.user.loadByEmail).not.toHaveBeenCalled();
  });

  it("clears the account counter after a successful login, but not the ip counter", async () => {
    const attempts = attemptStore();
    const { controller } = userController({ user: null, attempts });
    await controller.login(credReq(), res);
    expect(attempts.counts["account|a@b.c"]).toBe(1);

    const ok = userController({ user: { id: "u1", email: "a@b.c", password: "hash" }, attempts });
    (bcrypt.compareSync as jest.Mock).mockReturnValue(true);
    const result = await ok.controller.login(credReq(), res) as Result;
    expect(result.status).toBe(200);
    expect(attempts.counts["account|a@b.c"]).toBeUndefined();
    expect(attempts.counts["ip|1.1.1.1"]).toBe(1);
  });

  it("does not throttle a jwt refresh, even from an ip that is over the limit", async () => {
    const attempts = attemptStore();
    attempts.counts["ip|1.1.1.1"] = LoginRateLimiter.maxPerIp;
    const { controller } = userController({ user: null, attempts });
    (AuthenticatedUser.loadUserByJwt as jest.Mock).mockResolvedValue({ id: "u1", email: "a@b.c" });
    const result = await controller.login({ body: { jwt: "refresh-token" }, headers: {}, socket: { remoteAddress: "1.1.1.1" } } as express.Request, res) as Result;
    expect(result.status).toBe(200);
    expect(AuthenticatedUser.loadUserByJwt).toHaveBeenCalled();
  });

  it("does not let a spoofed x-forwarded-for reset the ip bucket", async () => {
    const attempts = attemptStore();
    attempts.counts["ip|203.0.113.7"] = LoginRateLimiter.maxPerIp;
    const { controller } = userController({ user: null, attempts });
    // Attacker prepends their own hop; API Gateway appends the real source ip last.
    const req = credReq({ email: "fresh@b.c" });
    req.headers = { "x-forwarded-for": "8.8.8.8, 203.0.113.7" };
    const result = await controller.login(req, res) as Result;
    expect(result.status).toBe(429);
  });
});

describe("UserController.login two-factor", () => {
  const secret = TotpHelper.generateSecret();
  function mfaRepo() {
    const row: UserMfa = { userId: "u1", secret, enabled: true, lastUsedStep: null, backupCodes: JSON.stringify([MfaHelper.hashBackupCode("abcde-fghjk")]) };
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
    const result = await controller.login(credReq(), res) as Result;
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
    const ok = await controller.login({ body: { mfaToken, mfaCode: code }, headers: {}, socket: { remoteAddress: "1.1.1.1" } } as express.Request, res) as Result;
    expect(ok.status).toBe(200);
    expect(ok.obj.user.id).toBe("u1");
    const replay = await controller.login({ body: { mfaToken, mfaCode: code }, headers: {}, socket: { remoteAddress: "1.1.1.1" } } as express.Request, res) as Result;
    expect(replay).toEqual({ obj: { errors: ["Invalid code"] }, status: 401 });
  });

  it("accepts a backup code once", async () => {
    const userMfa = mfaRepo();
    const { controller } = userController({ user: { id: "u1", email: "a@b.c" }, userMfa });
    const body = { mfaToken: MfaHelper.createLoginToken("u1"), mfaCode: "ABCDE FGHJK" };
    expect(((await controller.login({ body, headers: {}, socket: {} } as express.Request, res)) as Result).status).toBe(200);
    expect(((await controller.login({ body, headers: {}, socket: {} } as express.Request, res)) as Result).status).toBe(401);
  });

  it("rejects a forged challenge token and a user jwt posing as one", async () => {
    const { controller } = userController({ user: { id: "u1", email: "a@b.c" }, userMfa: mfaRepo() });
    const code = TotpHelper.codeAt(secret, TotpHelper.currentStep());
    const jwt = require("jsonwebtoken");
    const userJwt = jwt.sign({ id: "u1", purpose: "mfa" }, "test-secret");
    const result = await controller.login({ body: { mfaToken: userJwt, mfaCode: code }, headers: {}, socket: {} } as express.Request, res) as Result;
    expect(result.status).toBe(401);
  });

  it("does not challenge a jwt refresh", async () => {
    const { controller } = userController({ user: null, userMfa: mfaRepo() });
    (AuthenticatedUser.loadUserByJwt as jest.Mock).mockResolvedValue({ id: "u1", email: "a@b.c" });
    const result = await controller.login({ body: { jwt: "refresh" }, headers: {}, socket: {} } as express.Request, res) as Result;
    expect(result.obj.user.id).toBe("u1");
  });
});
