import "reflect-metadata";
import crypto from "crypto";

const mockExchange = jest.fn();
const mockRefresh = jest.fn();
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class {} }));
jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: jest.fn(),
  getProvider: jest.fn(() => ({ exchangeCodeForTokens: (...args: unknown[]) => mockExchange(...args) })),
  getProviderConfig: jest.fn(() => ({ oauthBase: "https://login.microsoftonline.com/common/oauth2/v2.0", clientId: "49a15ab2-868f-4612-8b03-c1c7fae485f1" })),
  TokenHelper: class { refreshToken(...args: unknown[]) { return mockRefresh(...args); } }
}));

import { getProvider, setProviderSecret } from "@churchapps/content-providers";
import { ProviderRelayTokenController } from "../ProviderRelayTokenController.js";

const VERIFIER = "a".repeat(64);
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");
const REDIRECT = "https://api.example/membership/oauth/relay/callback";

function harness(session: any) {
  const repos: any = { oAuthRelaySession: { loadBySessionCode: jest.fn(async () => session), delete: jest.fn() } };
  const controller = new ProviderRelayTokenController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status?: number) => ({ obj, status: status ?? 200 });
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
    const session = { id: "s1", provider, status: "completed", authCode: "captured-code", redirectUri: `${REDIRECT}\n${CHALLENGE}` };
    const { controller, repos } = harness(session);
    const result: any = await controller.exchange("ABCD2345", { body: { codeVerifier: VERIFIER } } as any, {} as any);
    expect(mockExchange).toHaveBeenCalledWith("captured-code", VERIFIER, REDIRECT);
    expect(repos.oAuthRelaySession.delete).toHaveBeenCalledWith("s1");
    expect(result.status).toBe(200);
    expect(result.obj).toEqual(expect.objectContaining({ status: "completed", access_token: "at", refresh_token: "rt" }));
    expect(setProviderSecret).toHaveBeenCalledWith("onedrive", "od-secret");
  });

  it("returns pending and leaves the session in place", async () => {
    const session = { id: "s1", provider: "onedrive", status: "pending", authCode: null, redirectUri: `${REDIRECT}\n${CHALLENGE}`, expiresAt: new Date(Date.now() + 50_000) };
    const { controller, repos } = harness(session);
    const result: any = await controller.exchange("ABCD2345", { body: { codeVerifier: VERIFIER } } as any, {} as any);
    expect(result.obj.status).toBe("pending");
    expect(result.obj.expiresIn).toBeGreaterThan(0);
    expect(result.obj).not.toHaveProperty("authCode");
    expect(mockExchange).not.toHaveBeenCalled();
    expect(repos.oAuthRelaySession.delete).not.toHaveBeenCalled();
  });

  it("rejects a verifier that does not match the stored challenge", async () => {
    const session = { id: "s1", provider: "onedrive", status: "completed", authCode: "captured-code", redirectUri: `${REDIRECT}\n${CHALLENGE}` };
    const { controller, repos } = harness(session);
    const result: any = await controller.exchange("ABCD2345", { body: { codeVerifier: "b".repeat(64) } } as any, {} as any);
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_grant");
    expect(getProvider).not.toHaveBeenCalled();
    expect(repos.oAuthRelaySession.delete).not.toHaveBeenCalled();
  });

  it("rejects providers that do not need a server secret", async () => {
    const session = { id: "s1", provider: "dropbox", status: "completed", authCode: "c", redirectUri: `${REDIRECT}\n${CHALLENGE}` };
    const dropbox: any = await harness(session).controller.exchange("ABCD2345", { body: { codeVerifier: VERIFIER } } as any, {} as any);
    const go: any = await harness({ ...session, provider: "gocurriculum" }).controller.exchange("ABCD2345", { body: { codeVerifier: VERIFIER } } as any, {} as any);
    expect(dropbox.obj.error).toBe("unsupported_provider");
    expect(go.obj.error).toBe("unsupported_provider");
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("refreshes onedrive and googledrive and rejects anything else", async () => {
    const { controller } = harness(null);
    const ok: any = await controller.refresh({ body: { provider: "onedrive", refreshToken: "refresh-1" } } as any, {} as any);
    expect(ok.status).toBe(200);
    expect(ok.obj).toEqual(expect.objectContaining({ access_token: "new-at", refresh_token: "new-rt" }));
    expect(mockRefresh).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ refresh_token: "refresh-1" }));
    const denied: any = await controller.refresh({ body: { provider: "gocurriculum", refreshToken: "refresh-1" } } as any, {} as any);
    expect(denied.status).toBe(400);
    expect(denied.obj.error).toBe("unsupported_provider");
  });
});
