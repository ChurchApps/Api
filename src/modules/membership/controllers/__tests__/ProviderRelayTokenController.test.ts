import "reflect-metadata";
import crypto from "crypto";

jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status?: number) { return { obj, status: status ?? 200 }; } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: {} }));
jest.mock("../../repositories/OAuthRelaySessionRepo.js", () => ({ OAuthRelaySessionRepo: { isSessionCode: (value: unknown) => typeof value === "string" && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(value) } }));
jest.mock("../../helpers/ProviderRelayTokenHelper.js", () => {
  const actual = jest.requireActual("../../helpers/ProviderRelayTokenHelper.js");
  return { ...actual, prepareRelayExchange: jest.fn(), runRelayExchange: jest.fn(), prepareRelayRefresh: jest.fn(), runRelayRefresh: jest.fn() };
});

import { prepareRelayExchange, prepareRelayRefresh, runRelayExchange, runRelayRefresh } from "../../helpers/ProviderRelayTokenHelper.js";
import { ProviderRelayTokenController } from "../ProviderRelayTokenController.js";

const VERIFIER = "a".repeat(64);
const CHALLENGE = crypto.createHash("sha256").update(VERIFIER).digest("base64url");

function controllerFor(session: any) {
  const repos: any = {
    oAuthRelaySession: {
      loadBySessionCode: jest.fn(async () => session),
      claimCompleted: jest.fn(async () => true),
      delete: jest.fn()
    },
    loginAttempt: { loadCount: jest.fn(async () => 0), increment: jest.fn() }
  };
  const controller = new ProviderRelayTokenController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status?: number) => ({ obj, status: status ?? 200 });
  const req = { body: { codeVerifier: VERIFIER }, headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  return { controller, repos, req };
}

describe("ProviderRelayTokenController", () => {
  beforeEach(() => jest.clearAllMocks());

  it("claims and deletes the session only after a ready exchange, and returns the device tokens", async () => {
    (prepareRelayExchange as jest.Mock).mockReturnValue({ ready: true, providerId: "onedrive", authCode: "captured", redirectUri: "https://api.example/membership/oauth/relay/callback", codeVerifier: VERIFIER });
    (runRelayExchange as jest.Mock).mockResolvedValue({ status: 200, body: { status: "completed", access_token: "at", refresh_token: "rt", token_type: "Bearer", expires_in: 3600, scope: "Files.Read.All", created_at: 100 } });
    const session = { id: "s1", provider: "onedrive", status: "completed", authCode: "captured", codeChallenge: CHALLENGE };
    const { controller, repos, req } = controllerFor(session);
    const result: any = await controller.exchange("ABCD2345", req as any, {} as any);
    expect(repos.oAuthRelaySession.claimCompleted).toHaveBeenCalledWith("s1");
    expect(runRelayExchange).toHaveBeenCalled();
    expect(repos.oAuthRelaySession.delete).toHaveBeenCalledWith("s1");
    expect(result.status).toBe(200);
    expect(result.obj.refresh_token).toBe("rt");
    expect(repos.oAuthRelaySession.claimCompleted.mock.invocationCallOrder[0]).toBeLessThan((runRelayExchange as jest.Mock).mock.invocationCallOrder[0]);
  });

  it("returns pending without claiming or deleting the session", async () => {
    (prepareRelayExchange as jest.Mock).mockReturnValue({ ready: false, result: { status: 200, body: { status: "pending", expiresIn: 40 } } });
    const { controller, repos, req } = controllerFor({ id: "s1", status: "pending", codeChallenge: CHALLENGE });
    const result: any = await controller.exchange("ABCD2345", req as any, {} as any);
    expect(result.obj).toEqual({ status: "pending", expiresIn: 40 });
    expect(repos.oAuthRelaySession.claimCompleted).not.toHaveBeenCalled();
    expect(repos.oAuthRelaySession.delete).not.toHaveBeenCalled();
    expect(runRelayExchange).not.toHaveBeenCalled();
  });

  it("does not exchange when the claim loses the race", async () => {
    (prepareRelayExchange as jest.Mock).mockReturnValue({ ready: true, providerId: "googledrive", authCode: "captured", redirectUri: "https://api.example/cb", codeVerifier: VERIFIER });
    const { controller, repos, req } = controllerFor({ id: "s1", status: "completed" });
    repos.oAuthRelaySession.claimCompleted.mockResolvedValue(false);
    const result: any = await controller.exchange("ABCD2345", req as any, {} as any);
    expect(result.status).toBe(400);
    expect(result.obj.error).toBe("invalid_grant");
    expect(runRelayExchange).not.toHaveBeenCalled();
    expect(repos.oAuthRelaySession.delete).not.toHaveBeenCalled();
  });

  it("404s an unknown or malformed session code", async () => {
    const { controller, repos, req } = controllerFor(null);
    const missing: any = await controller.exchange("ABCD2345", req as any, {} as any);
    const malformed: any = await controller.exchange("not-a-code", req as any, {} as any);
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(repos.oAuthRelaySession.loadBySessionCode).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when the relay budget is exhausted", async () => {
    (prepareRelayExchange as jest.Mock).mockReturnValue({ ready: false, result: { status: 200, body: { status: "pending", expiresIn: 10 } } });
    const { controller, repos, req } = controllerFor({ id: "s1", status: "pending" });
    repos.loginAttempt.loadCount.mockResolvedValue(999);
    const result: any = await controller.exchange("ABCD2345", req as any, {} as any);
    expect(result.status).toBe(429);
    expect(runRelayExchange).not.toHaveBeenCalled();
  });

  it("refreshes through the helper and returns tokens to the device", async () => {
    (prepareRelayRefresh as jest.Mock).mockReturnValue({ ready: true, providerId: "onedrive", refreshToken: "rt" });
    (runRelayRefresh as jest.Mock).mockResolvedValue({ status: 200, body: { access_token: "at", refresh_token: "rt2", token_type: "Bearer", expires_in: 3600, scope: "", created_at: 5 } });
    const { controller, req } = controllerFor(null);
    req.body = { provider: "onedrive", refreshToken: "rt" } as any;
    const result: any = await controller.refresh(req as any, {} as any);
    expect(result.status).toBe(200);
    expect(result.obj).toEqual(expect.objectContaining({ access_token: "at", refresh_token: "rt2" }));
  });

  it("does not refresh when the provider is not allowed", async () => {
    (prepareRelayRefresh as jest.Mock).mockReturnValue({ ready: false, result: { status: 400, body: { error: "unsupported_provider", error_description: "This provider refreshes on the device" } } });
    const { controller, req } = controllerFor(null);
    req.body = { provider: "dropbox", refreshToken: "rt" } as any;
    const result: any = await controller.refresh(req as any, {} as any);
    expect(result.status).toBe(400);
    expect(runRelayRefresh).not.toHaveBeenCalled();
  });
});
