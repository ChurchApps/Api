import crypto from "crypto";

const mockExchange = jest.fn();
const mockRefresh = jest.fn();
jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: jest.fn(),
  getProvider: jest.fn(() => ({ exchangeCodeForTokens: (...args: unknown[]) => mockExchange(...args) })),
  getProviderConfig: jest.fn(),
  TokenHelper: class { refreshToken(...args: unknown[]) { return mockRefresh(...args); } }
}));

import { getProvider, getProviderConfig, setProviderSecret } from "@churchapps/content-providers";
import { prepareRelayExchange, prepareRelayRefresh, refreshRateBuckets, runRelayExchange, runRelayRefresh, consumeRelayBudget, exchangeRateBuckets } from "../ProviderRelayTokenHelper.js";

const VERIFIER = "a".repeat(64);
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
const OTHER_VERIFIER = "b".repeat(64);

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess1",
    sessionCode: "ABCD2345",
    provider: "onedrive",
    authCode: "auth-from-microsoft",
    redirectUri: "https://api.churchapps.org/membership/oauth/relay/callback",
    codeChallenge: CHALLENGE,
    status: "completed",
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides
  } as any;
}

describe("ProviderRelayTokenHelper exchange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ONEDRIVE_CLIENT_SECRET = "od-secret";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "gd-secret";
    process.env.GOCURRICULUM_CLIENT_SECRET = "gc-secret";
    mockExchange.mockResolvedValue({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "Files.Read.All", token_type: "Bearer", created_at: 100 });
  });

  it.each(["onedrive", "googledrive", "gocurriculum"])("exchanges only the auth code captured on the %s relay session", async (provider) => {
    const prepared = prepareRelayExchange(session({ provider, authCode: "captured-code" }), VERIFIER, "captured-code");
    expect(prepared.ready).toBe(true);
    if (!prepared.ready) return;
    expect(prepared.authCode).toBe("captured-code");
    expect(prepared.redirectUri).toBe("https://api.churchapps.org/membership/oauth/relay/callback");
    const result = await runRelayExchange(prepared);
    expect(mockExchange).toHaveBeenCalledWith("captured-code", VERIFIER, "https://api.churchapps.org/membership/oauth/relay/callback");
    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({ status: "completed", access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer", created_at: 100 }));
    expect(setProviderSecret).toHaveBeenCalledWith(provider, provider === "onedrive" ? "od-secret" : provider === "googledrive" ? "gd-secret" : "gc-secret");
  });

  it("uses the captured code when the device does not resend it", () => {
    const prepared = prepareRelayExchange(session({ authCode: "captured-code" }), VERIFIER);
    expect(prepared.ready).toBe(true);
    if (prepared.ready) expect(prepared.authCode).toBe("captured-code");
  });

  it("does not call the provider when the presented code does not match the session", () => {
    const prepared = prepareRelayExchange(session(), VERIFIER, "attacker-code");
    expect(prepared.ready).toBe(false);
    if (prepared.ready) return;
    expect(prepared.result.status).toBe(400);
    expect(prepared.result.body.error).toBe("invalid_grant");
    expect(prepared.result.consume).toBeFalsy();
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("rejects a verifier that does not match the stored challenge and does not spend the code", () => {
    const prepared = prepareRelayExchange(session(), OTHER_VERIFIER);
    expect(prepared.ready).toBe(false);
    if (prepared.ready) return;
    expect(prepared.result.status).toBe(400);
    expect(prepared.result.consume).toBeFalsy();
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("returns pending without calling the provider when the callback has not landed", () => {
    const prepared = prepareRelayExchange(session({ status: "pending", authCode: null, expiresAt: new Date(Date.now() + 50_000) }), VERIFIER);
    expect(prepared.ready).toBe(false);
    if (prepared.ready) return;
    expect(prepared.result.status).toBe(200);
    expect(prepared.result.body.status).toBe("pending");
    expect(prepared.result.body.expiresIn).toBeGreaterThan(0);
    expect(prepared.result.body.expiresIn).toBeLessThanOrEqual(50);
    expect(prepared.result.body).not.toHaveProperty("authCode");
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("rejects public providers such as dropbox", () => {
    const prepared = prepareRelayExchange(session({ provider: "dropbox" }), VERIFIER);
    expect(prepared.ready).toBe(false);
    if (!prepared.ready) expect(prepared.result.body.error).toBe("unsupported_provider");
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("rejects a session that was not created with a code challenge", () => {
    const prepared = prepareRelayExchange(session({ codeChallenge: null }), VERIFIER);
    expect(prepared.ready).toBe(false);
    if (!prepared.ready) expect(prepared.result.body.error).toBe("invalid_request");
  });

  it("does not call the provider when the server secret is missing", () => {
    delete process.env.ONEDRIVE_CLIENT_SECRET;
    const prepared = prepareRelayExchange(session(), VERIFIER);
    expect(prepared.ready).toBe(false);
    if (!prepared.ready) expect(prepared.result.status).toBe(500);
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("reports provider rejection as invalid_grant", async () => {
    mockExchange.mockResolvedValue(null);
    const prepared = prepareRelayExchange(session(), VERIFIER);
    if (!prepared.ready) throw new Error("expected ready");
    const result = await runRelayExchange(prepared);
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("invalid_grant");
  });

  it("drops a completed session that never captured a code", () => {
    const prepared = prepareRelayExchange(session({ authCode: "" }), VERIFIER);
    expect(prepared.ready).toBe(false);
    if (!prepared.ready) expect(prepared.result.consume).toBe(true);
  });

  it("treats an already-claimed session as used", () => {
    const prepared = prepareRelayExchange(session({ status: "expired", authCode: null }), VERIFIER);
    expect(prepared.ready).toBe(false);
    if (!prepared.ready) expect(prepared.result.body.error_description).toBe("Authorization code already used");
  });
});

describe("ProviderRelayTokenHelper refresh", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ONEDRIVE_CLIENT_SECRET = "od-secret";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "gd-secret";
    (getProviderConfig as jest.Mock).mockReturnValue({ oauthBase: "https://login.microsoftonline.com/common/oauth2/v2.0", clientId: "49a15ab2-868f-4612-8b03-c1c7fae485f1", clientSecret: "od-secret" });
    mockRefresh.mockResolvedValue({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600, scope: "Files.Read.All offline_access", token_type: "Bearer", created_at: 200 });
  });

  it.each(["onedrive", "googledrive"])("refreshes %s with the server secret and returns the new tokens", async (provider) => {
    const prepared = prepareRelayRefresh(provider, "refresh-1");
    expect(prepared.ready).toBe(true);
    if (!prepared.ready) return;
    const result = await runRelayRefresh(prepared);
    expect(mockRefresh).toHaveBeenCalledWith(expect.objectContaining({ clientId: "49a15ab2-868f-4612-8b03-c1c7fae485f1" }), expect.objectContaining({ refresh_token: "refresh-1" }));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ access_token: "new-at", refresh_token: "new-rt", expires_in: 3600, scope: "Files.Read.All offline_access", token_type: "Bearer", created_at: 200 });
    expect(setProviderSecret).toHaveBeenCalledWith("onedrive", "od-secret");
  });

  it("keeps the previous refresh token when the provider does not rotate it", async () => {
    mockRefresh.mockResolvedValue({ access_token: "new-at", expires_in: 1800, token_type: "Bearer" });
    const prepared = prepareRelayRefresh("onedrive", "refresh-1");
    if (!prepared.ready) throw new Error("expected ready");
    const result = await runRelayRefresh(prepared);
    expect(result.body.refresh_token).toBe("refresh-1");
    expect(result.body.expires_in).toBe(1800);
  });

  it("rejects dropbox and an auth-code shaped request with no refresh token", () => {
    expect(prepareRelayRefresh("dropbox", "refresh-1").ready).toBe(false);
    expect(prepareRelayRefresh("onedrive", "").ready).toBe(false);
    expect(prepareRelayRefresh("https://evil.example/token", "refresh-1").ready).toBe(false);
    expect(getProviderConfig).not.toHaveBeenCalled();
  });

  it("does not put the refresh token in the rate-limit key", () => {
    const token = "super-secret-refresh-token";
    const buckets = refreshRateBuckets("203.0.113.5", token);
    expect(buckets.map((b) => b.key).join(" ")).not.toContain(token);
    expect(buckets[0].key).toMatch(/^relayrfsh:tok\|[a-f0-9]{32}$/);
  });
});

describe("ProviderRelayTokenHelper budget", () => {
  it("stops when a bucket is already full and does not increment", async () => {
    const increment = jest.fn();
    const repos = { loginAttempt: { loadCount: jest.fn(async () => 240), increment } };
    const allowed = await consumeRelayBudget(repos, exchangeRateBuckets("203.0.113.5", "ABCD2345", false));
    expect(allowed).toBe(false);
    expect(increment).not.toHaveBeenCalled();
  });

  it("counts each bucket when all are under the limit", async () => {
    const increment = jest.fn();
    const repos = { loginAttempt: { loadCount: jest.fn(async () => 0), increment } };
    const buckets = exchangeRateBuckets("203.0.113.5", "ABCD2345", true);
    expect(await consumeRelayBudget(repos, buckets)).toBe(true);
    expect(increment).toHaveBeenCalledTimes(buckets.length);
    expect(buckets.some((b) => b.key === "relayxchg:grant|ABCD2345" && b.max === 8)).toBe(true);
  });

  it("fails open when the counter store throws", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const repos = { loginAttempt: { loadCount: jest.fn(async () => { throw new Error("db down"); }), increment: jest.fn() } };
    expect(await consumeRelayBudget(repos, [{ key: "k", max: 1 }])).toBe(true);
  });
});
