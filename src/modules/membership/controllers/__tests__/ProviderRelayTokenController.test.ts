import "reflect-metadata";
import crypto from "crypto";

const mockExchange = jest.fn();
const mockRefresh = jest.fn();
const mockAllow = jest.fn(async () => true);
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class {} }));
jest.mock("../../helpers/PublicPersonRateLimiter.js", () => ({ PublicPersonRateLimiter: { allow: (...args: unknown[]) => mockAllow(...(args as [])) } }));
jest.mock("../../helpers/LoginRateLimiter.js", () => ({ LoginRateLimiter: { getClientIp: () => "203.0.113.9" } }));
jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: jest.fn(),
  getProvider: jest.fn(() => ({ exchangeCodeForTokens: (...args: unknown[]) => mockExchange(...args) })),
  getProviderConfig: jest.fn(() => ({ oauthBase: "https://login.microsoftonline.com/common/oauth2/v2.0", clientId: "49a15ab2-868f-4612-8b03-c1c7fae485f1" })),
  TokenHelper: class { refreshToken(...args: unknown[]) { return mockRefresh(...args); } }
}));

import express from "express";
import { getProvider, setProviderSecret } from "@churchapps/content-providers";
import { ProviderRelayTokenController } from "../ProviderRelayTokenController.js";
import type { OAuthRelaySession } from "../../models/index.js";

type JsonOut = { obj: Record<string, unknown>; status: number };
const req = (data: Partial<express.Request>) => data as express.Request;
const res = {} as express.Response;

const VERIFIER = "a".repeat(64);
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "https://api.example/membership/oauth/relay/callback";

function harness(session: OAuthRelaySession | null) {
  const repos = { oAuthRelaySession: { loadBySessionCode: jest.fn(async () => session), delete: jest.fn() } };
  const controller = new ProviderRelayTokenController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
    json: (obj: unknown, status?: number) => ({ obj, status: status ?? 200 })
  });
  return { controller, repos };
}

describe("ProviderRelayTokenController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ONEDRIVE_CLIENT_SECRET = "od-secret";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "gd-secret";
    mockExchange.mockResolvedValue({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "Files.Read.All", token_type: "Bearer", created_at: 100 });
    mockRefresh.mockResolvedValue({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600, scope: "Files.Read.All", token_type: "Bearer", created_at: 200 });
  });

  it.each(["onedrive", "googledrive"])("exchanges the captured %s code when the verifier matches", async (provider) => {
    const session: OAuthRelaySession = { id: "s1", provider, status: "completed", authCode: "captured-code", redirectUri: `${REDIRECT}\n${CHALLENGE}` };
    const { controller, repos } = harness(session);
    const result = await controller.exchange("ABCD2345", req({ body: { codeVerifier: VERIFIER } }), res) as JsonOut;
    expect(mockExchange).toHaveBeenCalledWith("captured-code", VERIFIER, REDIRECT);
    expect(repos.oAuthRelaySession.delete).toHaveBeenCalledWith("s1");
    expect(result.status).toBe(200);
    expect(result.obj).toEqual(expect.objectContaining({ status: "completed", access_token: "at", refresh_token: "rt" }));
    expect(setProviderSecret).toHaveBeenCalledWith("onedrive", "od-secret");
  });

  it("returns pending and leaves the session in place", async () => {
    const session: OAuthRelaySession = { id: "s1", provider: "onedrive", status: "pending", authCode: null, redirectUri: `${REDIRECT}\n${CHALLENGE}`, expiresAt: new Date(Date.now() + 50_000) };
    const { controller, repos } = harness(session);
    const result = await controller.exchange("ABCD2345", req({ body: { codeVerifier: VERIFIER } }), res) as JsonOut;
    expect(result.obj.status).toBe("pending");
    expect(result.obj.expiresIn).toBeGreaterThan(0);
    expect(result.obj).not.toHaveProperty("authCode");
    expect(mockExchange).not.toHaveBeenCalled();
    expect(repos.oAuthRelaySession.delete).not.toHaveBeenCalled();
  });

  it("rejects a verifier that does not match the stored challenge", async () => {
    const session: OAuthRelaySession = { id: "s1", provider: "onedrive", status: "completed", authCode: "captured-code", redirectUri: `${REDIRECT}\n${CHALLENGE}` };
    const { controller, repos } = harness(session);
    const result = await controller.exchange("ABCD2345", req({ body: { codeVerifier: "b".repeat(64) } }), res) as JsonOut;
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_grant");
    expect(getProvider).not.toHaveBeenCalled();
    expect(repos.oAuthRelaySession.delete).not.toHaveBeenCalled();
  });

  it("rejects providers that do not need a server secret", async () => {
    const session: OAuthRelaySession = { id: "s1", provider: "dropbox", status: "completed", authCode: "c", redirectUri: `${REDIRECT}\n${CHALLENGE}` };
    const dropbox = await harness(session).controller.exchange("ABCD2345", req({ body: { codeVerifier: VERIFIER } }), res) as JsonOut;
    const go = await harness({ ...session, provider: "gocurriculum" }).controller.exchange("ABCD2345", req({ body: { codeVerifier: VERIFIER } }), res) as JsonOut;
    expect(dropbox.obj.error).toBe("unsupported_provider");
    expect(go.obj.error).toBe("unsupported_provider");
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("refreshes onedrive and googledrive and rejects anything else", async () => {
    const { controller } = harness(null);
    const ok = await controller.refresh(req({ body: { provider: "onedrive", refreshToken: "refresh-1" } }), res) as JsonOut;
    expect(ok.status).toBe(200);
    expect(ok.obj).toEqual(expect.objectContaining({ access_token: "new-at", refresh_token: "new-rt" }));
    expect(mockRefresh).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ refresh_token: "refresh-1" }));
    const denied = await controller.refresh(req({ body: { provider: "gocurriculum", refreshToken: "refresh-1" } }), res) as JsonOut;
    expect(denied.status).toBe(400);
    expect(denied.obj.error).toBe("unsupported_provider");
  });

  it("stops asking Go about catalog tokens once a caller goes over the limit", async () => {
    const getCatalog = jest.fn(async () => ({ catalog: [] as unknown[] }));
    (getProvider as jest.Mock).mockReturnValue({ getCatalog });
    mockAllow.mockResolvedValueOnce(false);
    const { controller, repos } = harness({});
    const result = await controller.goCurriculumCatalog(req({ body: { groupId: "elementary", accessToken: "guess" } }), res) as JsonOut;
    expect(result.status).toBe(429);
    expect(getCatalog).not.toHaveBeenCalled();
    expect(mockAllow).toHaveBeenCalledWith(repos, "203.0.113.9", "", "go-catalog", 300, 3600);
  });

  it("serves the Go catalog only for a token Go verifies", async () => {
    const getCatalog = jest.fn(async (groupId: string, auth: { access_token?: string }) => (auth.access_token === "good" ? { catalog: [{ id: groupId }] } : null));
    (getProvider as jest.Mock).mockReturnValue({ getCatalog });
    process.env.GOCURRICULUM_FEEDS = "{\"elementary\":\"https://feeds.test/e\"}";
    const { controller } = harness(null);
    const ok = await controller.goCurriculumCatalog(req({ body: { groupId: "elementary", accessToken: "good" } }), res) as JsonOut;
    expect(ok).toEqual({ obj: { catalog: [{ id: "elementary" }] }, status: 200 });
    expect(setProviderSecret).toHaveBeenCalledWith("gocurriculumFeeds", process.env.GOCURRICULUM_FEEDS);
    const bad = await controller.goCurriculumCatalog(req({ body: { groupId: "elementary", accessToken: "bad" } }), res) as JsonOut;
    expect(bad.status).toBe(404);
    const missing = await controller.goCurriculumCatalog(req({ body: { groupId: "elementary" } }), res) as JsonOut;
    expect(missing.status).toBe(400);
  });
});
