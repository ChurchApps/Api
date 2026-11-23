import "reflect-metadata";

// Stands in for any express-validator chain: every property and call returns the chain again.
type Chain = { (...args: unknown[]): Chain; [key: string]: Chain };
const chain: Chain = new Proxy(function () {} as Chain, { get: () => chain, apply: () => chain });

jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("express-validator", () => ({ body: () => chain, oneOf: () => chain, validationResult: jest.fn(() => ({ isEmpty: () => true, array: () => [] })) }));
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
    PublicPersonRateLimiter: { allow: jest.fn(async () => true) },
    UserHelper: { replaceDomainAdminPermissions: jest.fn(), addAllReportingPermissions: jest.fn(), sendLoginCodeEmail: jest.fn(async () => {}), sendForgotEmail: jest.fn(async () => {}) },
    UserChurchHelper: { createForNewUser: jest.fn() },
    AuthGuidHelper: { mint: () => ({ raw: "raw-guid", stored: "stored-guid" }) },
    UniqueIdHelper: { shortId: () => "tmp" },
    Environment: { currentEnvironment: "test", jwtSecret: "test-secret", isMailConfigured: true },
    Permissions: { server: { admin: "serverAdmin" }, people: { edit: "peopleEdit" } },
    AuditLogHelper: { getClientIp: jest.fn(() => "1.1.1.1"), logLogin: jest.fn(), log: jest.fn() },
    MauticHelper: { trackLogin: jest.fn(() => Promise.resolve()) },
    ChurchHelper: { appendLogos: jest.fn(async () => {}) }
  };
});
jest.mock("../../models/index", () => ({}));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: {} }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getOne: (arr: Record<string, unknown>[], k: string, v: unknown) => (arr || []).find((x) => x[k] === v) || null, getAll: () => [] } }));

import express from "express";
import { UserController } from "../UserController.js";
import { AuthenticatedUser } from "../../auth/index.js";
import { AuditLogHelper, UserHelper } from "../../helpers/index.js";
import { LoginRateLimiter } from "../../helpers/LoginRateLimiter.js";
import { MfaHelper } from "../../helpers/MfaHelper.js";
import type { LoginUserChurch, User } from "../../models/index.js";

type Result = { status?: number; obj?: Record<string, unknown> & { user?: User; mfaToken?: string } };
const res = {} as express.Response;
const sendLoginCodeEmail = UserHelper.sendLoginCodeEmail as jest.Mock;

// A users row and loginAttempts table held in memory, with the same conditional-update semantics as UserRepo.
function harness(opts: { user?: User | null; mfa?: boolean } = {}) {
  const row: User | null = opts.user === undefined ? { id: "u1", email: "a@b.c", password: "hash" } : opts.user;
  const counts: Record<string, number> = {};
  const repos = {
    user: {
      loadByEmail: jest.fn(async (email: string) => (row && row.email === email ? { ...row } : null)),
      save: jest.fn(async (u: User) => u),
      updateVerification: jest.fn(async (_id: string, hash: string, expires: Date) => { Object.assign(row, { verificationCode: hash, verificationExpires: expires, verificationAttempts: 0 }); }),
      incrementVerificationAttempts: jest.fn(async () => { row.verificationAttempts = (row.verificationAttempts || 0) + 1; return row.verificationAttempts; }),
      clearVerification: jest.fn(async () => { Object.assign(row, { verificationCode: null, verificationExpires: null, verificationAttempts: 0 }); }),
      consumeVerification: jest.fn(async (_id: string, expected: string) => {
        if (!row || row.verificationCode !== expected) return false;
        Object.assign(row, { verificationCode: null, verificationExpires: null, verificationAttempts: 0 });
        return true;
      })
    },
    userMfa: { isEnabled: jest.fn(async () => !!opts.mfa) },
    loginAttempt: {
      loadCount: jest.fn(async (key: string) => counts[key] ?? 0),
      increment: jest.fn(async (key: string) => { counts[key] = (counts[key] ?? 0) + 1; }),
      clear: jest.fn(async (keys: string[]) => { keys.forEach((k) => delete counts[k]); })
    }
  };
  const controller = new UserController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    json: (obj: unknown, status: number) => ({ obj, status }),
    denyAccess: (errors: string[]) => ({ obj: { errors }, status: 401 }),
    error: (errors: string[]) => ({ obj: { errors }, status: 500 }),
    getUserChurches: jest.fn(async () => [{ church: { id: "c1", name: "Test Church" }, person: { id: "p1" } }])
  });
  const request = (body: Record<string, unknown>) => ({ body, headers: {}, socket: { remoteAddress: "1.1.1.1" } }) as express.Request;
  const requestCode = async (email = "a@b.c") => (await controller.requestLoginCode(request({ email }), res)) as Result;
  const login = async (code: string, email = "a@b.c") => (await controller.loginWithCode(request({ email, code }), res)) as Result;
  const sentCode = () => sendLoginCodeEmail.mock.calls.at(-1)?.[1] as string;
  const wrong = (code: string) => (code === "000000" ? "111111" : "000000");
  return { controller, repos, row, counts, requestCode, login, sentCode, wrong };
}

beforeEach(() => {
  sendLoginCodeEmail.mockClear();
  (AuthenticatedUser.login as jest.Mock).mockClear();
  (AuditLogHelper.log as jest.Mock).mockClear();
  (AuditLogHelper.logLogin as jest.Mock).mockClear();
});

describe("UserController.requestLoginCode", () => {
  it("emails a 6-digit code and stores only a short-lived hash of it", async () => {
    const h = harness();
    const result = await h.requestCode();
    expect(result).toEqual({ obj: { emailed: true }, status: 200 });
    const code = h.sentCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(h.row.verificationCode).toMatch(/^login:\$2[aby]\$10\$/);
    expect(h.row.verificationCode).not.toContain(code);
    const ttl = new Date(h.row.verificationExpires).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("answers an unknown email exactly as a known one, and sends nothing", async () => {
    const known = await harness().requestCode();
    const unknownHarness = harness({ user: null });
    const unknown = await unknownHarness.requestCode("missing@b.c");
    expect(unknown).toEqual(known);
    expect(sendLoginCodeEmail).toHaveBeenCalledTimes(1);
  });

  it("never writes the code to the audit log", async () => {
    const h = harness();
    await h.requestCode();
    expect(JSON.stringify((AuditLogHelper.log as jest.Mock).mock.calls)).not.toContain(h.sentCode());
  });

  it("throttles repeated requests for one account", async () => {
    const h = harness();
    for (let i = 0; i < LoginRateLimiter.maxPerAccountStrict; i++) expect((await h.requestCode()).status).toBe(200);
    expect(await h.requestCode()).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
  });

  it("counts against the same bucket as password-reset requests", async () => {
    const h = harness();
    h.counts["account|forgot:a@b.c"] = LoginRateLimiter.maxPerAccountStrict;
    expect((await h.requestCode()).status).toBe(429);
    expect(sendLoginCodeEmail).not.toHaveBeenCalled();
  });
});

describe("UserController.loginWithCode", () => {
  const invalid = { obj: { errors: ["Invalid or expired code"] }, status: 400 };

  it("signs in with the emailed code and returns what password login returns", async () => {
    const h = harness();
    await h.requestCode();
    const result = await h.login(h.sentCode());
    expect(result.status).toBe(200);
    expect(result.obj).toEqual({ user: { id: "u1", email: "a@b.c" }, userChurches: [{ church: { id: "c1", name: "Test Church", settings: [] }, person: { id: "p1" } }] });
    expect(AuthenticatedUser.login).toHaveBeenCalledTimes(1);
    expect(h.row.verificationCode).toBeNull();
  });

  it("rejects a wrong code", async () => {
    const h = harness();
    await h.requestCode();
    expect(await h.login(h.wrong(h.sentCode()))).toEqual(invalid);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("rejects an expired code", async () => {
    const h = harness();
    await h.requestCode();
    h.row.verificationExpires = new Date(Date.now() - 1000);
    expect(await h.login(h.sentCode())).toEqual(invalid);
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("refuses a code the second time", async () => {
    const h = harness();
    await h.requestCode();
    const code = h.sentCode();
    expect((await h.login(code)).status).toBe(200);
    expect(await h.login(code)).toEqual(invalid);
    expect(AuthenticatedUser.login).toHaveBeenCalledTimes(1);
  });

  it("lets only one of two concurrent requests with the right code through", async () => {
    const h = harness();
    await h.requestCode();
    const code = h.sentCode();
    const results = await Promise.all([h.login(code), h.login(code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("answers an unknown email exactly as a wrong code", async () => {
    const known = harness();
    await known.requestCode();
    const wrongResult = await known.login(known.wrong(known.sentCode()));
    const unknownResult = await harness({ user: null }).login("123456", "missing@b.c");
    expect(unknownResult).toEqual(wrongResult);
  });

  it("burns the code after five wrong guesses, so even the right one then fails", async () => {
    const h = harness();
    await h.requestCode();
    const code = h.sentCode();
    for (let i = 0; i < 5; i++) expect(await h.login(h.wrong(code))).toEqual(invalid);
    expect(await h.login(code)).toEqual(invalid);
    expect(h.row.verificationCode).toBeNull();
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("throttles guessing per account, and a fresh code does not reset that budget", async () => {
    const h = harness();
    for (let i = 0; i < LoginRateLimiter.maxPerAccountStrict; i++) await h.login("000000");
    await h.requestCode();
    expect(await h.login(h.sentCode())).toEqual({ obj: { errors: ["Too many requests"] }, status: 429 });
  });

  it("does not accept a password-reset code", async () => {
    const h = harness();
    await h.requestCode();
    const code = h.sentCode();
    h.row.verificationCode = h.row.verificationCode.slice("login:".length);
    expect(await h.login(code)).toEqual(invalid);
  });

  it("is not accepted by the password-reset verify step", async () => {
    const h = harness();
    await h.requestCode();
    const result = (await h.controller.verifyCode({ body: { email: "a@b.c", code: h.sentCode() }, headers: {}, socket: {} } as express.Request, res)) as Result;
    expect(result).toEqual({ obj: { errors: ["invalid code"] }, status: 400 });
  });

  it("still asks an MFA account for its second factor instead of signing in", async () => {
    const h = harness({ mfa: true });
    await h.requestCode();
    const result = await h.login(h.sentCode());
    expect(result.status).toBe(200);
    expect(result.obj.mfaRequired).toBe(true);
    expect(result.obj.user).toBeUndefined();
    expect(MfaHelper.verifyLoginToken(result.obj.mfaToken)).toBe("u1");
    expect(AuthenticatedUser.login).not.toHaveBeenCalled();
  });

  it("never writes the code to the audit log", async () => {
    const h = harness();
    await h.requestCode();
    const code = h.sentCode();
    await h.login(h.wrong(code));
    await h.login(code);
    const logged = JSON.stringify([(AuditLogHelper.log as jest.Mock).mock.calls, (AuditLogHelper.logLogin as jest.Mock).mock.calls]);
    expect(logged).not.toContain(code);
  });
});
