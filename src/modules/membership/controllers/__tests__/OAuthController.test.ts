import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { settings: { edit: "settingsEdit" }, server: { admin: "serverAdmin" } },
  UniqueIdHelper: { shortId: () => "short", secret: () => "a".repeat(64) },
  UserHelper: { loadExpandedPermissions: jest.fn(async () => []) },
  PublicPersonRateLimiter: { allow: jest.fn(async () => true) },
  LoginRateLimiter: { getClientIp: () => "127.0.0.1" }
}));
jest.mock("../../auth/index", () => ({ AuthenticatedUser: { getCombinedApiJwt: jest.fn() } }));
jest.mock("../../models/index", () => ({}));
jest.mock("../../repositories/index", () => ({
  OAuthDeviceCodeRepo: { generateDeviceCode: () => "dc", generateUserCode: () => "uc" },
  OAuthRelaySessionRepo: { generateSessionCode: () => "sc" }
}));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "https://api.example", b1AdminRoot: "https://admin.example", oauthAccessTokenSeconds: 10 } }));
jest.mock("../../../../shared/auth/Scopes.js", () => ({ parseScopes: () => [], listAllScopes: () => ["people:read"] }));
jest.mock("../../helpers/OAuthConnectionHelper.js", () => ({ toConnections: (rows: unknown) => rows }));

import express from "express";
import type { AuthenticatedUser } from "@churchapps/apihelper";
import { OAuthController } from "../OAuthController.js";
import type { OAuthClient, OAuthCode, OAuthDeviceCode, OAuthRelaySession, OAuthToken } from "../../models/index.js";

type JsonOut = { obj: Record<string, unknown> & { refresh_token?: string }; status: number };
// Client rows come back from MySQL with selfRegistered as a tinyint.
type ClientRow = Omit<OAuthClient, "selfRegistered"> & { selfRegistered?: number };
const req = (data: Partial<express.Request>) => data as express.Request;
const res = {} as express.Response;
const anon = (_req: express.Request, _res: express.Response, action: () => unknown) => action();
const authed = (au: Partial<AuthenticatedUser>) => (_req: express.Request, _res: express.Response, action: (au: AuthenticatedUser) => unknown) => action(au as AuthenticatedUser);

function oauthController(opts: { session?: OAuthRelaySession } = {}) {
  const repos = {
    oAuthRelaySession: {
      loadBySessionCode: jest.fn(async () => opts.session ?? null),
      save: jest.fn(async (s: OAuthRelaySession) => s),
      delete: jest.fn()
    }
  };
  const controller = new OAuthController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: anon,
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

function htmlRes() {
  let body = "";
  const res = {} as express.Response;
  res.setHeader = jest.fn();
  res.send = jest.fn((html: string) => { body = html; return res; });
  return { res, getBody: () => body };
}

describe("OAuthController.createRelaySession", () => {
  const challenge = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOQR";

  it("stores an optional PKCE S256 challenge on the relay redirect and returns the clean URI", async () => {
    const { controller, repos } = oauthController();
    const result = await controller.createRelaySession(req({ body: { provider: "onedrive", codeChallenge: challenge } }), res) as JsonOut;
    expect(repos.oAuthRelaySession.save).toHaveBeenCalledWith(expect.objectContaining({
      provider: "onedrive",
      redirectUri: `https://api.example/oauth/relay/callback\n${challenge}`,
      status: "pending"
    }));
    expect(result.obj.redirectUri).toBe("https://api.example/oauth/relay/callback");
  });

  it("rejects a challenge that is not S256 and does not create a session", async () => {
    const { controller, repos } = oauthController();
    const result = await controller.createRelaySession(req({ body: { provider: "onedrive", codeChallenge: "not-a-challenge" } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_request");
    expect(repos.oAuthRelaySession.save).not.toHaveBeenCalled();
  });
});

describe("OAuthController.relayCallback", () => {
  it("does not return a script-shaped error query raw in HTML", async () => {
    const { controller } = oauthController();
    const { res, getBody } = htmlRes();
    const payload = "<script>alert(1)</script>";
    await controller.relayCallback(req({ query: { error: payload } }), res);
    const html = getBody();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
    expect(html).not.toContain(payload);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Authorization Error");
  });

  it("still shows a provider error code after escaping", async () => {
    const { controller } = oauthController();
    const { res, getBody } = htmlRes();
    await controller.relayCallback(req({ query: { error: "access_denied" } }), res);
    expect(getBody()).toContain("access_denied");
    expect(getBody()).toContain("Authorization Error");
  });

  it("completes a real relay callback and shows the success page", async () => {
    const session: OAuthRelaySession = { id: "s1", sessionCode: "abc", status: "pending" };
    const { controller, repos } = oauthController({ session });
    const { res, getBody } = htmlRes();
    await controller.relayCallback(req({ query: { code: "auth-code", state: "abc" } }), res);
    expect(repos.oAuthRelaySession.save).toHaveBeenCalledWith(expect.objectContaining({ authCode: "auth-code", status: "completed" }));
    expect(getBody()).toContain("Success!");
    expect(getBody()).toContain("Authorization complete");
    expect(getBody()).not.toContain("<script>");
  });
});

describe("OAuthController access token TTL", () => {
  it("device grant expires_in matches Environment.oauthAccessTokenSeconds", async () => {
    const { AuthenticatedUser } = jest.requireMock("../../auth/index");
    AuthenticatedUser.getCombinedApiJwt.mockReturnValue("jwt");

    const repos = {
      oAuthDeviceCode: {
        loadByDeviceCode: jest.fn(async () => ({
          id: "d1",
          clientId: "c1",
          status: "approved",
          userChurchId: "uc1",
          scopes: "plans",
          planTypeId: "pt1",
          expiresAt: new Date(Date.now() + 60_000)
        })),
        delete: jest.fn()
      },
      userChurch: { load: jest.fn(async () => ({ id: "uc1", userId: "u1", churchId: "ch1", personId: "p1" })) },
      user: { load: jest.fn(async () => ({ id: "u1", email: "a@b.c" })) },
      church: { loadById: jest.fn(async () => ({ id: "ch1", churchName: "Demo", subDomain: "demo" })) },
      person: { loadByIdsOnly: jest.fn(async () => [{ membershipStatus: "Member" }]) },
      groupMember: { loadForPeople: jest.fn(async () => []) },
      oAuthToken: { save: jest.fn(async (t: OAuthToken) => t) }
    };
    const controller = new OAuthController();
    let payload: Record<string, unknown>;
    Object.assign(controller, {
      repos,
      actionWrapperAnon: anon,
      json: (obj: Record<string, unknown>) => { payload = obj; return obj; }
    });

    await controller.token(req({ body: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: "dc", client_id: "c1" } }), res);

    expect(payload.expires_in).toBe(10);
    expect(payload.plan_type_id).toBe("pt1");
    expect(AuthenticatedUser.getCombinedApiJwt).toHaveBeenCalledWith(expect.anything(), expect.anything(), 10, expect.anything());
  });
});

describe("OAuthController relay + device code hardening", () => {
  it("does not overwrite an already-completed relay session", async () => {
    const session: OAuthRelaySession = { id: "s1", sessionCode: "abc", status: "completed", authCode: "victim-code" };
    const { controller, repos } = oauthController({ session });
    const { res, getBody } = htmlRes();
    await controller.relayCallback(req({ query: { code: "attacker-code", state: "abc" } }), res);
    expect(repos.oAuthRelaySession.save).not.toHaveBeenCalled();
    expect(getBody()).not.toContain("Success!");
  });

  function deviceController(dc: OAuthDeviceCode) {
    const repos = {
      oAuthDeviceCode: { loadByUserCode: jest.fn(async () => dc), save: jest.fn() },
      userChurch: { loadByUserId: jest.fn(async () => ({ id: "uc1" })) }
    };
    const controller = new OAuthController();
    Object.assign(controller, {
      repos,
      actionWrapper: authed({ id: "u1", churchId: "c1" }),
      json: (obj: unknown, status: number) => ({ obj, status })
    });
    return { controller, repos };
  }

  it("refuses to approve an expired device code", async () => {
    const { controller, repos } = deviceController({ id: "d1", status: "pending", expiresAt: new Date(Date.now() - 1000) });
    const result = await controller.approveDevice(req({ body: { user_code: "ABCD", church_id: "c1" } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.oAuthDeviceCode.save).not.toHaveBeenCalled();
  });

  it("approves a live device code", async () => {
    const { controller, repos } = deviceController({ id: "d1", status: "pending", expiresAt: new Date(Date.now() + 60000) });
    await controller.approveDevice(req({ body: { user_code: "ABCD", church_id: "c1" } }), res);
    expect(repos.oAuthDeviceCode.save).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", userChurchId: "uc1" }));
  });

  it("ignores deny on an expired device code", async () => {
    const { controller, repos } = deviceController({ id: "d1", status: "pending", expiresAt: new Date(Date.now() - 1000) });
    const result = await controller.denyDevice(req({ body: { user_code: "ABCD" } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(repos.oAuthDeviceCode.save).not.toHaveBeenCalled();
  });
});

describe("OAuthController MCP connector sign-in (DCR + PKCE)", () => {
  // RFC 7636 Appendix B verifier/challenge pair.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const claudeCallback = "https://claude.ai/api/mcp/auth_callback";
  const publicClient: ClientRow = { id: "cl1", clientId: "pub1", name: "Claude", clientSecret: null as string, redirectUris: claudeCallback, selfRegistered: 1 };

  function mcpController(opts: { client?: ClientRow; code?: OAuthCode } = {}) {
    const repos = {
      oAuthClient: {
        loadByClientId: jest.fn(async () => opts.client ?? publicClient),
        loadByClientIdAndSecret: jest.fn(async () => null),
        save: jest.fn(async (c: OAuthClient) => ({ ...c, id: "new" }))
      },
      oAuthCode: {
        save: jest.fn(async (c: OAuthCode) => c),
        loadByCode: jest.fn(async () => opts.code ?? null),
        consume: jest.fn(async () => true),
        delete: jest.fn()
      },
      userChurch: {
        loadByUserId: jest.fn(async () => ({ id: "uc1" })),
        load: jest.fn(async () => ({ id: "uc1", userId: "u1", churchId: "ch1", personId: "p1" }))
      },
      user: { load: jest.fn(async () => ({ id: "u1", email: "a@b.c" })) },
      church: { loadById: jest.fn(async () => ({ id: "ch1", name: "Grace", subDomain: "grace" })) },
      person: { loadByIdsOnly: jest.fn(async () => [{ membershipStatus: "Member" }]) },
      groupMember: { loadForPeople: jest.fn(async () => []) },
      oAuthToken: { save: jest.fn(async (t: OAuthToken) => t) }
    };
    const controller = new OAuthController();
    Object.assign(controller, {
      repos,
      actionWrapper: authed({ id: "u1", churchId: "ch1" }),
      actionWrapperAnon: anon,
      json: (obj: unknown, status: number = 200) => ({ obj, status })
    });
    return { controller, repos };
  }

  it("lets a public client register itself with https and loopback redirect URIs and issues no secret", async () => {
    const { controller, repos } = mcpController();
    const result = await controller.register(req({ body: { client_name: "Claude", redirect_uris: [claudeCallback, "http://localhost:33418/callback"], token_endpoint_auth_method: "client_secret_post" } }), res) as JsonOut;
    expect(result.status).toBe(201);
    expect(result.obj.client_id).toBe("short");
    expect(result.obj.client_secret).toBeUndefined();
    expect(result.obj.token_endpoint_auth_method).toBe("none");
    expect(result.obj.redirect_uris).toEqual([claudeCallback, "http://localhost:33418/callback"]);
    expect(repos.oAuthClient.save).toHaveBeenCalledWith(expect.objectContaining({ clientId: "short", name: "Claude", selfRegistered: true, clientSecret: null }));
  });

  it.each([["http://evil.example/callback"], ["javascript:alert(1)"], ["https://claude.ai/cb#frag"]])("refuses to register redirect URI %s", async (uri) => {
    const { controller, repos } = mcpController();
    const result = await controller.register(req({ body: { client_name: "X", redirect_uris: [uri] } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_redirect_uri");
    expect(repos.oAuthClient.save).not.toHaveBeenCalled();
  });

  it("stores the S256 code challenge with the authorization code", async () => {
    const { controller, repos } = mcpController();
    const result = await controller.authorize(req({ body: { client_id: "pub1", redirect_uri: claudeCallback, response_type: "code", scope: "people:read", code_challenge: challenge, code_challenge_method: "S256" } }), res) as JsonOut;
    expect(result.obj.code).toBeTruthy();
    expect(repos.oAuthCode.save).toHaveBeenCalledWith(expect.objectContaining({ codeChallenge: challenge, codeChallengeMethod: "S256", userChurchId: "uc1" }));
  });

  it("requires a code challenge from a client that has no secret", async () => {
    const { controller, repos } = mcpController();
    const result = await controller.authorize(req({ body: { client_id: "pub1", redirect_uri: claudeCallback, response_type: "code", scope: "people:read" } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_request");
    expect(repos.oAuthCode.save).not.toHaveBeenCalled();
  });

  it("rejects a redirect URI that is only a prefix of a registered one", async () => {
    const { controller, repos } = mcpController();
    const result = await controller.authorize(req({ body: { client_id: "pub1", redirect_uri: "https://claude.ai/api", response_type: "code", scope: "", code_challenge: challenge, code_challenge_method: "S256" } }), res) as JsonOut;
    expect(result.obj.error).toBe("invalid_redirect_uri");
    expect(repos.oAuthCode.save).not.toHaveBeenCalled();
  });

  it("exchanges a code for tokens with the matching code_verifier and no secret, form-encoded", async () => {
    const { AuthenticatedUser } = jest.requireMock("../../auth/index");
    AuthenticatedUser.getCombinedApiJwt.mockReturnValue("jwt");
    const code: OAuthCode = { id: "code1", code: "c0de", clientId: "pub1", userChurchId: "uc1", redirectUri: claudeCallback, scopes: "people:read", codeChallenge: challenge, codeChallengeMethod: "S256", expiresAt: new Date(Date.now() + 60000) };
    const { controller, repos } = mcpController({ code });
    const body = new URLSearchParams({ grant_type: "authorization_code", code: "c0de", client_id: "pub1", redirect_uri: claudeCallback, code_verifier: verifier, resource: "https://api.example/mcp" }).toString();
    const result = await controller.token(req({ body }), res) as JsonOut;
    expect(result.obj.access_token).toBe("jwt");
    expect(result.obj.refresh_token).toBeTruthy();
    expect(repos.oAuthCode.consume).toHaveBeenCalledWith("code1");
  });

  it("refuses the exchange when the code_verifier does not match", async () => {
    const code: OAuthCode = { id: "code1", code: "c0de", clientId: "pub1", userChurchId: "uc1", redirectUri: claudeCallback, scopes: "people:read", codeChallenge: challenge, codeChallengeMethod: "S256", expiresAt: new Date(Date.now() + 60000) };
    const { controller, repos } = mcpController({ code });
    const result = await controller.token(req({ body: { grant_type: "authorization_code", code: "c0de", client_id: "pub1", code_verifier: "x".repeat(43) } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_grant");
    expect(repos.oAuthCode.consume).not.toHaveBeenCalled();
  });
});

describe("OAuthController refresh rotation grace window (#1024)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  let seq = 0;

  function refreshController(rows: OAuthToken[]) {
    const helpers = jest.requireMock("../../helpers/index");
    helpers.UniqueIdHelper.secret = () => "rt" + (++seq);
    const { AuthenticatedUser } = jest.requireMock("../../auth/index");
    AuthenticatedUser.getCombinedApiJwt.mockReturnValue("jwt");
    const repos = {
      oAuthClient: { loadByClientIdAndSecret: jest.fn(async () => ({ clientId: "fp", name: "FreePlay", clientSecret: "s" })), loadByClientId: jest.fn(async () => null) },
      userChurch: { load: jest.fn(async () => ({ id: "uc1", userId: "u1", churchId: "ch1", personId: "p1" })) },
      user: { load: jest.fn(async () => ({ id: "u1", email: "a@b.c" })) },
      church: { loadById: jest.fn(async () => ({ id: "ch1", name: "Grace", subDomain: "grace" })) },
      person: { loadByIdsOnly: jest.fn(async () => [{ membershipStatus: "Member" }]) },
      groupMember: { loadForPeople: jest.fn(async () => []) },
      oAuthToken: {
        loadByRefreshToken: jest.fn(async (rt: string) => rows.find((r) => r.refreshToken === rt) ?? null),
        load: jest.fn(async (id: string) => rows.find((r) => r.id === id) ?? null),
        save: jest.fn(async (t: OAuthToken) => {
          if (!t.id) { t.id = "tok" + (++seq); rows.push({ ...t }); return t; }
          const i = rows.findIndex((r) => r.id === t.id);
          rows[i] = { ...t };
          return t;
        }),
        delete: jest.fn(async (id: string) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); })
      }
    };
    const controller = new OAuthController();
    Object.assign(controller, {
      repos,
      actionWrapperAnon: anon,
      json: (obj: unknown, status: number = 200) => ({ obj, status })
    });
    const refresh = (rt: string) => controller.token(req({ body: { grant_type: "refresh_token", refresh_token: rt, client_id: "fp", client_secret: "s" } }), res) as Promise<JsonOut>;
    return { refresh, repos };
  }

  const tvToken = (): OAuthToken => ({ id: "tv0", clientId: "fp", userChurchId: "uc1", refreshToken: "old", scopes: "plans", planTypeId: "pt1", expiresAt: new Date(Date.now() + 80 * DAY) });

  afterEach(() => jest.useRealTimers());

  it("keeps the old refresh token for a short grace window instead of deleting it", async () => {
    const rows = [tvToken()];
    const { refresh } = refreshController(rows);
    const result = await refresh("old");
    expect(result.status).toBe(200);
    expect(result.obj.refresh_token).not.toBe("old");
    const old = rows.find((r) => r.id === "tv0");
    expect(old).toBeTruthy();
    expect(old.replacedById).toBe(rows.find((r) => r.refreshToken === result.obj.refresh_token).id);
    expect(new Date(old.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY + 1000);
  });

  it("lets a TV that missed the rotation reply refresh again with its old token and keeps the plan type", async () => {
    const rows = [tvToken()];
    const { refresh } = refreshController(rows);
    const lost = await refresh("old");
    const retry = await refresh("old");
    expect(retry.status).toBe(200);
    expect(retry.obj.plan_type_id).toBe("pt1");
    expect(retry.obj.refresh_token).not.toBe(lost.obj.refresh_token);
    // The reply that never arrived does not linger as a second live connection.
    expect(rows.find((r) => r.refreshToken === lost.obj.refresh_token)).toBeUndefined();
    expect(rows.filter((r) => !r.replacedById)).toHaveLength(1);
    const next = await refresh(retry.obj.refresh_token);
    expect(next.status).toBe(200);
  });

  it("refuses the old token once the token that replaced it has been used", async () => {
    const rows = [tvToken()];
    const { refresh } = refreshController(rows);
    const first = await refresh("old");
    await refresh(first.obj.refresh_token);
    const replay = await refresh("old");
    expect(replay.status).toBe(400);
    expect(replay.obj.error).toBe("invalid_grant");
  });

  it("refuses the old token after the grace window", async () => {
    const rows = [tvToken()];
    const { refresh } = refreshController(rows);
    await refresh("old");
    jest.useFakeTimers({ now: Date.now() + 8 * DAY });
    const late = await refresh("old");
    expect(late.status).toBe(400);
    expect(late.obj.error).toBe("invalid_grant");
  });

  it("revokes the rotated tokens along with the connection", async () => {
    const repos = {
      oAuthToken: { load: jest.fn(async () => ({ id: "tok2", userChurchId: "uc1" })), delete: jest.fn(), deleteWithPredecessors: jest.fn() },
      userChurch: { loadByUserId: jest.fn(async () => ({ id: "uc1" })) }
    };
    const controller = new OAuthController();
    Object.assign(controller, {
      repos,
      actionWrapper: authed({ id: "u1", churchId: "ch1", checkAccess: () => true }),
      json: (obj: unknown, status: number = 200) => ({ obj, status })
    });
    const result = await controller.deleteConnection("tok2", req({}), res) as JsonOut;
    expect(result.status).toBe(200);
    expect(repos.oAuthToken.deleteWithPredecessors).toHaveBeenCalledWith("tok2");
  });

  it("still refuses a refresh token past its own expiry", async () => {
    const rows = [{ ...tvToken(), expiresAt: new Date(Date.now() - DAY) }];
    const { refresh } = refreshController(rows);
    const result = await refresh("old");
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_grant");
  });
});

describe("OAuthController device authorization client check", () => {
  function deviceAuthController(client: ClientRow) {
    const repos = {
      oAuthClient: { loadByClientId: jest.fn(async () => client) },
      oAuthDeviceCode: { save: jest.fn(async (d: OAuthDeviceCode) => d) }
    };
    const controller = new OAuthController();
    Object.assign(controller, {
      repos,
      actionWrapperAnon: anon,
      json: (obj: unknown, status: number = 200) => ({ obj, status })
    });
    return { controller, repos };
  }

  it("refuses device codes for self-registered clients, which only sign in with a code and PKCE", async () => {
    const { controller, repos } = deviceAuthController({ id: "cl1", clientId: "pub1", name: "Church TV", clientSecret: null, redirectUris: "https://claude.ai/api/mcp/auth_callback", selfRegistered: 1 });
    const result = await controller.deviceAuthorize(req({ body: { client_id: "pub1" } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_client");
    expect(repos.oAuthDeviceCode.save).not.toHaveBeenCalled();
  });

  it("still issues device codes for clients we registered", async () => {
    const { controller, repos } = deviceAuthController({ id: "cl2", clientId: "freeplay", name: "FreePlay", clientSecret: "s", redirectUris: "", selfRegistered: 0 });
    const result = await controller.deviceAuthorize(req({ body: { client_id: "freeplay" } }), res) as JsonOut;
    expect(result.obj.device_code).toBe("dc");
    expect(repos.oAuthDeviceCode.save).toHaveBeenCalled();
  });
});
